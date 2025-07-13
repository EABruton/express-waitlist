/**
 * @import { ExpressRequest } from '../typedefs.js';
 */

/**
 * Clears all party-related variables from the session.
 * Any non-party variables are left unchanged.
 *
 * @param {ExpressRequest} request - the client request
 * @returns {void}
 */
export default function clearPartySession(request) {
  delete request?.session.partyID;
  delete request?.session.partySize;
  delete request?.session.status;
  delete request?.session.seated;
  delete request?.session.seatExpiresAt;
}
