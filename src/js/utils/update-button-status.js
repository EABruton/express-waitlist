export const BUTTON_STATUS_PENDING = "pending";
export const BUTTON_STATUS_ACTIVE = "active";
export const BUTTON_STATUS_ERROR = "error";

/**
 * Updates a button's status between "active", "pending", or "error",
 * which changes what text is displayed.
 * Also handles toggling the disabled status.
 *
 * @param {HTMLElement} button - the button to update the status of
 * @param {BUTTON_STATUS_ACTIVE | BUTTON_STATUS_ERROR | BUTTON_STATUS_PENDING} status - the status to update the button to
 * @returns {void}
 */
export default function updateButtonStatus(button, status) {
  button.setAttribute("data-status", status);

  if (status !== BUTTON_STATUS_ACTIVE) {
    button.setAttribute("disabled", true);
    return;
  }

  button.removeAttribute("disabled");
}
