/**
 * @file This file provides functions for building and removing an error notice
 * component, ensuring consistent formatting of error messages.
 */

const NOTICE_CLASS = "error-notice";

/**
 * Build an element to display a given error message with the appropriate
 * HTML.
 *
 * @param {string} errorMessage - the message for the error notice to display
 * @returns {HTMLElement} the error notice element
 */
export function buildErrorNotice(errorMessage) {
  const errorContainer = document.createElement("div");
  errorContainer.setAttribute("role", "alert");
  errorContainer.classList.add(NOTICE_CLASS);
  errorContainer.setAttribute("data-testid", "error-notice");

  const errorPrefixText = document.createElement("strong");
  errorPrefixText.classList.add(NOTICE_CLASS + "__prefix");
  errorPrefixText.textContent = "Error:";

  const errorMessageText = document.createElement("span");
  errorMessageText.classList.add(NOTICE_CLASS + "__text");
  errorMessageText.textContent = errorMessage;

  errorContainer.append(errorPrefixText, errorMessageText);

  return errorContainer;
}

/**
 * Cleans up old error notices from the DOM.
 *
 * @returns {void}
 */
export function removeOldErrorNotices() {
  for (const errorNotice of [
    ...document.querySelectorAll("." + NOTICE_CLASS),
  ]) {
    errorNotice.remove();
  }
}
