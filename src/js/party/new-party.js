import api from "../api.js";
import {
  buildErrorNotice,
  removeOldErrorNotices,
} from "../components/errors-notice.js";
import { ENDPOINT_PARTY_STATUS } from "../constants.js";
import updateButtonStatus, {
  BUTTON_STATUS_ACTIVE,
  BUTTON_STATUS_PENDING,
} from "../utils/update-button-status.js";

const errorNoticeID = "checkin-error-notice";
const waitlistForm = document.querySelector("#waitlist-join-form");
const submitButton = document.querySelector('button[type="submit"]');
const redirect = () => window.location.replace(ENDPOINT_PARTY_STATUS);

/**
 * Handles the form submission for joining the waitlist.
 *
 * @param {FormDataEvent} e
 * @returns {Promise<void>}
 * @listens submit
 * @this {HTMLFormElement}
 * @description
 * This function prevents the default form submission behavior, updates the button status to pending,
 * collects the form data, and sends it to the server via an API request.
 * If the request is successful, it handles the success by redirecting the user to the status page.
 * If there is an error, it builds an error notice and displays it above the form
 */
async function handleSubmit(e) {
  e.preventDefault();

  // convert the button to a pending state (preventing repeated clicks)
  updateButtonStatus(submitButton, BUTTON_STATUS_PENDING);

  // format and submit the data
  const formData = new FormData(this);
  const jsonData = Object.fromEntries(formData);
  const [error, _result] = await api.makeRequest("/party", {
    method: "POST",
    body: JSON.stringify(jsonData),
  });

  if (error) {
    const errorNotice = buildErrorNotice(error);
    errorNotice.id = errorNoticeID;

    // cleanup any previous submit errors
    removeOldErrorNotices();

    // add the new notice above the form
    waitlistForm.before(errorNotice);
    waitlistForm.setAttribute("aria-describedby", errorNoticeID);
    updateButtonStatus(submitButton, BUTTON_STATUS_ACTIVE);
    return;
  }

  // redirect the user to the status page
  redirect();
}

handleSubmit.bind(waitlistForm);
waitlistForm.addEventListener("submit", handleSubmit);
