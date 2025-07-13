/**
 * @file This file provides an interface method for interacting with the API, allowing
 * error handling, consistent error formatting, and pre-configuration of headers.
 */

const BASE_URL = window.__SERVER_BASE_URL__;
const headers = new Headers([
  ["Accept", "application/json"],
  ["Content-Type", "application/json"],
]);

// this error class is for differentiating error messages that are OK to display to the user
// versus those that are not
class ResponseError extends Error {
  constructor(...params) {
    super(...params);
    this.name = "ResponseError";
  }
}

/**
 * Makes an API request, providing error wrapping and handling around the request.
 *
 * @param {string} path - the URL path (starting with a "/") where to make the request
 * @param {RequestInit} fetchConfig - partial options for a fetch request (headers are attached)
 * @returns {Promise<[null | string, object | null]>}
 * a tuple where
 * the first value of the return will be null if there is no error, otherwise a string detailing the error in a friendly,
 * user-facing way
 * the second value will be the response object (if successful the request was successful),
 * otherwise null
 */
async function makeRequest(path, fetchConfig) {
  try {
    const response = await fetch(BASE_URL + path, {
      headers,
      ...fetchConfig,
      credentials: "include",
    });
    // if the response is 204 No Content, we return null for the response
    if (response.status === 204) return [null, null];
    const jsonResponse = await response.json();

    // we throw a customized error here to differentiate whether it's
    // OK to render to the user or not (versus an uncaught error)
    if (!response.ok) {
      throw new ResponseError(jsonResponse.message);
    }

    return [null, jsonResponse];
  } catch (error) {
    /** @param {Error} error */
    console.error(error);

    // this is likely from the response message not containing json,
    // in which case, we need to use some generic error message
    if (error instanceof SyntaxError) {
      return ["Unable to create party, please contact an admin", null];
    }

    // this message should be safe to display to the user
    if (error instanceof ResponseError) {
      return [error.message, null];
    }

    // the message may not be safe to display, so we return a generic error message
    return ["An error occurred! Please try again", null];
  }
}

export default {
  makeRequest,
};
