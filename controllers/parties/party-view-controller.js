/**
 * @file Defines controllers for rendering pages responsible for creating and monitoring the status of waitlist parties.
 */

import parties from "../../models/parties.js";
import { STATUS_SEATED } from "../../constants/party-statuses.js";
import { getClientErrorMessage } from "../../constants/errors.js";
import clearPartySession from "../../utils/clear-party-session.js";
import { MAX_PARY_NAME_LENGTH, MAX_SEATS } from "../../config/waitlist.js";

/**
 * @import { ExpressRequest, ExpressResponse } from '../../typedefs.js';
 */

/**
 * Controller for joining a waitlist.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * Checks to see if the client is already in an existing party and redirects them
 * to the status page if so, or deletes their session if it is stale.
 *
 * If the client is not in a party, renders the page for creating a new party.
 */
async function renderNewPartyPage(req, res) {
  // check for if the user already has a party ID set in their cookie
  const { partyID } = req.session ?? {};

  // if set, check if it's stale by checking the database for the user
  if (partyID) {
    const [partyError, party] = await parties.getPartyByID(partyID);

    // clear the cookie if the party no longer exists in the database
    if (partyError || !party) {
      clearPartySession(req);
    }
    // the session cookie is not stale, so redirect the user to the status page
    else {
      res.redirect("/party");
      return;
    }
  }

  res.render("party/new-party", {
    title: "Check In",
    styles: ["/dist/css/party/new-party.css"],
    scripts: ["/dist/js/party/new-party.js"],
    serverBaseURL: req.baseURL,
    maxSeatCount: MAX_SEATS,
    maxPartyNameLength: MAX_PARY_NAME_LENGTH,
  });
}

/**
 * Controller for rendering the page that shows the party's position in queue
 * and offers the check-in button when they have been dequeued.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * Checks if the party exists and, if so, sends a response with the status pages,
 * where the client can view the party's position in queue and check in.
 */
async function renderPartyStatusPage(req, res) {
  // the initial queue position is used for the intial render (to prevent layout shift)
  // afterwards, it's replaced by the client's up-to-date queue position via
  // connection to the event stream
  const { partyID, initialQueuePosition, status } = req.session ?? {};

  // if the partyID wasn't set, the user should be redirected to the join waitlist page
  if (!partyID) {
    res.redirect("/party/new");
    return;
  }

  let lookupError;
  const [error, party] = await parties.getPartyByID(partyID);
  if (error) {
    // continue to the page, but render a recommendation to refresh the page on error
    lookupError = getClientErrorMessage(error);
  }
  if (!party) {
    clearPartySession(req);
    res.redirect("/party/new");
    return;
  }

  const isSeated = status && status === STATUS_SEATED;

  res.render("party/party-status", {
    title: "Waitlist Status",
    styles: ["/dist/css/party/party-status.css"],
    scripts: ["/dist/js/party/party-status.js"],
    serverBaseURL: req.baseURL,
    partyID,
    initialQueuePosition,
    // if status is set, the user is seated
    isSeated,
    isQueued: !isSeated,
    lookupError,
  });
}

export default {
  renderNewPartyPage,
  renderPartyStatusPage,
};
