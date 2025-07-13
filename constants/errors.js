// external error codes (with a client-facing message mapped)
export const PARTY_NOT_FOUND = "PARTY_NOT_FOUND";
export const PARTY_COULD_NOT_BE_CREATED = "PARTY_COULD_NOT_BE_CREATED";
export const PARTY_COULD_NOT_BE_DELETED = "PARTY_COULD_NOT_BE_DELETED";
export const PARTY_COULD_NOT_CHECK_IN = "PARTY_COULD_NOT_CHECK_IN";
export const PARTY_COULD_NOT_SET_SEATED = "PARTY_COULD_NOT_SET_SEATED";

export const FALLBACK_ERROR_MESSAGE = "Server error";

// internal error codes
export const COULD_NOT_CALCULATE_PARTY_QUEUE_POSITIONS =
  "PARTY_COULD_NOT_CALCULATE_QUEUE_POSITIONS";
export const COULD_NOT_GET_MAX_AVAILABLE_SEATS =
  "COULD_NOT_GET_MAX_AVAILABLE_SEATS";
export const COULD_NOT_GET_PARTIES_TO_DEQUEUE =
  "COULD_NOT_GET_PARTIES_TO_DEQUEUE";
export const COULD_NOT_DELETE_CHECKIN_EXPIRED_PARTIES =
  "COULD_NOT_DELETE_CHECKIN_EXPIRED_PARTIES";
export const COULD_NOT_REMOVE_EXPIRED_SEATS = "COULD_NOT_REMOVE_EXPIRED_SEATS";

const CODE_TO_ERROR_MESSAGE = {
  PARTY_NOT_FOUND: "Could not find party",
  PARTY_COULD_NOT_BE_CREATED: "Could not create party",
  PARTY_COULD_NOT_BE_DELETED: "Could not delete party",
  PARTY_COULD_NOT_CHECK_IN: "Could not check-in",
  PARTY_COULD_NOT_SET_SEATED: "Could not seat party",
};

// non-code-related error messages
export const ERROR_INVALID_REQUEST = "Invalid request";
export const ERROR_UNAUTHORIZED = "Unauthorized request";

/**
 * Gets a client-facing message from an error code.
 * Uses the fallback code if no corresponding message is found.
 *
 * @param {string} errorCode - the error code to map to a message
 * @returns {string} the error to send to the client
 */
export function getClientErrorMessage(errorCode) {
  return CODE_TO_ERROR_MESSAGE[errorCode] ?? FALLBACK_ERROR_MESSAGE;
}
