/**
 * @file Defines controllers for endpoints accessed by waitlist parties.
 */

import redis from "../../utils/redis.js";
import logger from "../../utils/logger.js";
import parties from "../../models/parties.js";
import {
  DEQUEUE_QUEUE,
  SEAT_EXPIRED_QUEUE,
} from "../../constants/message-queues.js";
import eventStreamService from "../../services/event-stream-service.js";
import { STATUS_SEATED } from "../../constants/party-statuses.js";
import scheduleJobAt from "../../utils/schedule-job.js";
import { validationResult } from "express-validator";
import { matchedData } from "express-validator";
import {
  ERROR_INVALID_REQUEST,
  ERROR_UNAUTHORIZED,
  getClientErrorMessage,
  PARTY_NOT_FOUND,
} from "../../constants/errors.js";
import clearPartySession from "../../utils/clear-party-session.js";

/**
 * @import { ExpressRequest, ExpressResponse } from '../typedefs.js';
 */

/**
 * Controller for joining a waitlist.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * Acts as an endpoint for creating a new party.
 * If a new party is successfully created, a cookie session is created with its information, and a dequeue is scheduled.
 * Sends back a 201 response on success, with the party's ID and position in queue.
 */
async function createParty(req, res) {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    // the only way this should be sent (with the in-built HTML validation) is if
    // a purposely-malformed request is sent
    res.status(400).json({ message: ERROR_INVALID_REQUEST });
    return;
  }

  const { size, name } = matchedData(req);
  const [error, result] = await parties.createParty(name, size);

  if (error) {
    res.status(400).json({ message: getClientErrorMessage(error) });
    return;
  }

  const { partyID, positionInQueue } = result;
  // create a session cookie with the party ID
  // we use this to save future DB lookups
  req.session.partyID = partyID;
  req.session.partySize = size;

  // save the initial position in queue for displaying when we reach the status page
  req.session.initialQueuePosition = positionInQueue;

  const queue = redis.createQueue(DEQUEUE_QUEUE);
  // the string value here does not matter, as the job checks the DB for parties needing dequeue
  await queue.add("dequeue");

  res.status(201).json(result);
}

/**
 * Controller for streaming events for a party.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * This controller sets up an event stream for a party.
 * It checks if the party exists and if it is already seated.
 * If the party is not found, it sends a message and ends the stream.
 * If the party is already seated, it sends a message and ends the stream.
 * If the party is found and not seated, it sets up the event stream.
 *
 * The event stream will send updates about the party's status.
 * The client can listen to this stream to get real-time updates about the party's status.
 * The stream will be closed when the client disconnects or when the party is seated.
 */
async function streamPartyEvents(req, res) {
  const { partyID, status } = req.session ?? {};

  // if the user is currently seated, do not proceed to any DB checks or connecting the event stream
  if (status && status === STATUS_SEATED) {
    res.end();
    return;
  }

  // If there is no party ID in the session, send a party not found error
  if (!partyID) {
    res.status(401).json({ message: getClientErrorMessage(PARTY_NOT_FOUND) });
    return;
  }

  // Check if the party still exists and send an error if not
  const [error, party] = await parties.getPartyByID(partyID);
  if (error || !party) {
    res.status(404).json({ message: getClientErrorMessage(error) });
    return;
  }

  // connect the event stream
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  req.on("close", () => {
    logger.info("Event stream with client closed");
  });

  await eventStreamService.setupStream(party, res);
}

/**
 * Controller for seating a party after they've hit 'check-in'.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * The controller verifies that the request is from an authorized party via a cookie session check.
 * It attempts to update the party's seated to seated, then schedules the seat expiration worker to cleanup the party when their seat is scheduled to expire.
 *
 * Sends a 200 success code and message on success.
 */
async function checkInParty(req, res) {
  const { partyID, partySize } = req.session ?? {};

  // in the event that the session is stale (and there's no party ID)
  // we just send an error
  if (!partyID || !partySize) {
    clearPartySession(req);
    res.status(401).json({ message: ERROR_UNAUTHORIZED });
    return;
  }

  const [error, seatExpiration] = await parties.updateSeatedStatus(
    partyID,
    parseInt(partySize),
  );

  if (error) {
    // In the event that the user never checked in, they might still have a partyID
    // session present, but the party would have already been wiped from the DB.
    // In this case, we want to clear the session to prevent the client from getting stuck on the status page.
    if (error === PARTY_NOT_FOUND) {
      clearPartySession(req);
    }

    res.status(400).json({ message: getClientErrorMessage(error) });
    return;
  }

  // Schedule a job to expire the seat after a certain time
  const queue = redis.createQueue(SEAT_EXPIRED_QUEUE);
  await scheduleJobAt(queue, "seat-expired", {}, new Date(seatExpiration));

  // Update existing session cookie with max age to expiration time
  // Add the seated status to cookies
  // This will allow auto-cleanup of sessions
  req.session.seatExpiresAt = seatExpiration;
  req.session.partyID = partyID;
  req.session.status = STATUS_SEATED;

  res.status(200).json({ message: "Successfully checked in" });
}

/**
 * Controller that allows the party to leave the queue.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @description
 * Verifies that the request is coming from a verified party via a cookie session check.
 * If it successfully deletes the party from the database, it clears their session and
 * then schedules a dequeue so that the next parties can move up in the queue.
 *
 * Sends a 204 success code and empty request body on success.
 */
async function deleteParty(req, res) {
  const { partyID, partySize } = req.session ?? {};

  // in the event that the session is stale (and there's no party ID)
  // we just send an error
  if (!partyID || !partySize) {
    clearPartySession(req);
    res.status(401).json({ message: ERROR_UNAUTHORIZED });
    return;
  }

  // delete party from the database
  const [error, _result] = await parties.deletePartyByID(partyID);

  if (error) {
    if (error === PARTY_NOT_FOUND) {
      clearPartySession(req);
    }

    res.status(400).json({ message: getClientErrorMessage(error) });
    return;
  }

  // if the party was successfully deleted, we can remove the session cookie
  // and fire the queue to dequeue the next party
  clearPartySession(req);

  const queue = redis.createQueue(DEQUEUE_QUEUE);
  // the string value here does not matter, as the job checks the DB for parties needing dequeue
  await queue.add("dequeue-party");

  res.status(204).json({});
}

export default {
  createParty,
  streamPartyEvents,
  checkInParty,
  deleteParty,
};
