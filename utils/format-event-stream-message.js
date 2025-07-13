/**
 * Formats a javascript object to fit the format that works with an event
 * stream.
 *
 * @param {object} messageObj - the object to format
 * @returns {string} the stringified, event stream message
 */
export default function formatEventStreamMessage(messageObj) {
  const header = "data: ";
  const message = JSON.stringify(messageObj);
  const footer = "\n\n";

  return header + message + footer;
}
