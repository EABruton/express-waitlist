import { STATUS_SEATED } from "../constants/party-statuses.js";
import clearPartySession from "../utils/clear-party-session.js";
import logger from "../utils/logger.js";

/**
 * @import { ExpressRequest, ExpressResponse, ExpressNext } from '../typedefs.js';
 */

/**
 * Cleansup clients who have been seated's session based on seat expiration.
 *
 * @param {ExpressRequest} req
 * @param {ExpressResponse} res
 * @param {ExpressNext} next
 * @description
 * This middleware gets the client's seated status and seat expiration from the current session.
 * If the client has been seated, but that seat is expired, removes party-related session data.
 */
function cleanupExpiredSeatSession(req, _res, next) {
  const { status, seatExpiresAt } = req.session ?? {};
  const isSeated = status === STATUS_SEATED;

  if (!isSeated || !seatExpiresAt) {
    next();
    return;
  }

  const now = Date.now();
  const expiresAt = new Date(seatExpiresAt).getTime();

  if (now >= expiresAt) {
    logger.info("[Session]: Seat expired, clearing session info");
    clearPartySession(req);
  }
  next();
}

export default cleanupExpiredSeatSession;
