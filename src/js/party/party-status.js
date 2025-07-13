/**
 * @file The code handles the display of a party's position in queue,
 * a check-in button, a check-in-success notice, and a check-in-expire notice.
 */
import eventStatuses from "../shared-constants/event-statuses.js";
import api from "../api.js";
import {
  buildErrorNotice,
  removeOldErrorNotices,
} from "../components/errors-notice.js";
import { ENDPOINT_EVENT_STREAM } from "../constants.js";
import setTimeRemainingWatch from "../utils/time-remaining-watch.js";
import updateButtonStatus, {
  BUTTON_STATUS_ACTIVE,
  BUTTON_STATUS_PENDING,
} from "../utils/update-button-status.js";

/** @type {EventSource | undefined} */
let eventSource;

/**
 * @typedef {object} EventMessage
 * @property {eventStatuses.EVENT_STATUS_DEQUEUED | eventStatuses.EVENT_STATUS_CHECKING_IN_EXPIRED | eventStatuses.EVENT_STATUS_QUEUE_POSITION_UPDATE } status - what type of message this is
 * @property {number?} position - the position in queue, if a queue position update
 * @property {string?} checkingInExpiration - the expiration time for the checking-in status, if a dequeued message
 * @description
 * This is the message format that the server will send to the client via the event stream.
 * The client will listen for these messages and update the UI accordingly.
 * The `status` field indicates the type of message, and the other fields are optional depending
 * on the type of message.
 * - `can-dequeue`: indicates that the user can now check in, and includes the `checkingInExpiration` field
 * - `queue-position-update`: indicates the user's position in queue
 * - `checkin-window-expired`: indicates that the user's check-in window has expired
 *   and they should return to the waitlist page
 */

/** @type {HTMLTemplateElement} */
const checkinSuccessTemplate = document.querySelector(
  "#checkin-success-template",
);
/** @type {HTMLTemplateElement} */
const eventErrorTemplate = document.querySelector("#event-error-template");
/** @type {HTMLTemplateElement} */
const noPartyNoticeTemplate = document.querySelector("#no-party-id-template");
/** @type {HTMLTemplateElement} */
const checkinFormTemplate = document.querySelector("#check-in-template");
/** @type {HTMLTemplateElement} */
const checkinExpiredTemplate = document.querySelector(
  "#checking-in-expired-template",
);

/** @type {HTMLElement} */
const titleOriginal = document.title;
/** @type {HTMLElement} */
const heading = document.querySelector("h1");
/** @type {HTMLElement} */
const checkinSuccessPlaceholder = document.querySelector(
  "#checkin-success-placeholder",
);
/** @type {HTMLElement} */
const eventErrorPlaceholder = document.querySelector(
  "#event-error-placeholder",
);
/** @type {HTMLElement} */
const noPartyNoticePlaceholder = document.querySelector(
  "#no-party-notice-placeholder",
);
/** @type {HTMLElement} */
const checkinFormPlaceholder = document.querySelector(
  "#checkin-form-placeholder",
);
/** @type {HTMLElement} */
const checkinExpiredPlaceholder = document.querySelector(
  "#checkin-expired-placeholder",
);
/** @type {HTMLElement} */
const partyIDContainer = document.querySelector("#party-id-container");

/** @type {HTMLElement} */
const queuePositionTextElement = document.querySelector("#queue-position-text");
/** @type {HTMLButtonElement} */
const leaveQueueButton = document.querySelector("#leave-queue-button");
const selectorQueuePositionElement = "#queue-position";
const selectorCheckin = "#check-in";
const selectorCheckinButton = "#check-in-button";
const selectorCheckinExpiration = "#check-in-expiration";

/**
 * Utility method for removing the other notices on the page.
 *
 * @returns {void}
 */
function removeOtherNotices() {
  for (const element of [
    ...document.querySelectorAll(
      [selectorCheckin, selectorQueuePositionElement].join(", "),
    ),
  ]) {
    element.remove();
  }
}

/**
 * A utility method for prepending a message to the original title text (used for status updates).
 *
 * @param {string} prefixText - the text to prefix the title with
 * @returns {void}
 */
function addTitlePrefix(prefixText) {
  document.title = `${prefixText} ${titleOriginal}`;
}

/**
 * Sends a leave queue request to the server, allowing the user to leave the queue.
 *
 * @param {Event} e - the event that triggered this function, typically a click event
 * @returns {Promise<void>}
 * @listens submit
 * @this {HTMLFormElement}
 * @description
 * This function sends a request to the server to leave the queue for the given party.
 * It updates the button status to pending while the request is being processed,
 * and if the request is successful, it disconnects the event source.
 * If the request fails, it re-enables the button and displays an error notice.
 */
async function sendLeaveQueueRequest(e) {
  e.preventDefault();

  // disable the button and update its status to pending
  updateButtonStatus(this, BUTTON_STATUS_PENDING);

  // fire the request to the server to leave the queue
  const [error, _response] = await api.makeRequest(`/party`, {
    method: "DELETE",
  });

  // if the response is not ok, then display an error notice
  if (error) {
    // re-enable the button and update its status to active
    updateButtonStatus(this, BUTTON_STATUS_ACTIVE);
    removeOldErrorNotices();
    const errorNotice = buildErrorNotice(error);
    heading.after(errorNotice);
    return;
  }

  // disconnect the event source
  eventSource?.close();

  // add a success notice
  addLeaveQueueSuccessNotice();
}

/**
 * Sends a request to the server to check in the user for the given party ID.
 *
 * @param {HTMLElement} checkinForm - the form element to replace with a success notice
 * @returns {Promise<void>}
 * @listens submit
 * @this {HTMLFormElement}
 * @description
 * This function sends a request to the server to check in the client's party.
 * If the request is successful, it will replace the check-in form with a success notice.
 * If the request fails, it will build an error notice and insert it before the check-in form.
 */
async function sendCheckinRequest(e) {
  e.preventDefault();

  // disable the button and update its status to pending
  updateButtonStatus(this, BUTTON_STATUS_PENDING);

  // fire the request to the server to check in
  const [error, _response] = await api.makeRequest("/party/check-in", {
    method: "PATCH",
    body: JSON.stringify({}),
  });

  // if the response is not ok, then display an error notice
  if (error) {
    // re-enable the button and update its status to active
    updateButtonStatus(this, BUTTON_STATUS_ACTIVE);
    removeOldErrorNotices();
    const errorNotice = buildErrorNotice(error);
    heading.after(errorNotice);
    return;
  }

  // disconnect the event source
  eventSource?.close();

  // render a success notice
  addCheckinSuccessNotice();
}

/**
 * Renders a button to show that the user may now checkin, as well
 * as a notice to indicate how long they have until that button expires
 *
 * @param {string} checkingInExpiration - the expiration time for the checking-in status (sent from an SSE)
 * @returns {void}
 * @description
 * This function removes any other notices on the page, then renders a check-in form
 * with a button to check in. The button will be disabled until the user clicks it,
 * at which point it will send a request to the server to check in the user.
 *
 * A timer notice will also be added to indicate how long the user has until the check-in
 * expires. The timer will be updated every second until it reaches 0, at which point
 * the button will be disabled and a notice will be shown to indicate that the checkin
 * has expired.
 */
function handleCheckedInReady(checkingInExpiration) {
  removeOtherNotices();
  const checkinFormContent = checkinFormTemplate.content.cloneNode(true);
  const checkinButton = checkinFormContent.querySelector(selectorCheckinButton);
  const checkinExpirationElement = checkinFormContent.querySelector(
    selectorCheckinExpiration,
  );

  // set the expiration time for the checkin
  const expirationDate = new Date(checkingInExpiration);
  const expirationTime = expirationDate.getTime();
  // set the text content of the expiration element
  checkinExpirationElement.textContent = expirationDate.toLocaleString();
  // Add an event listener to the button to enable it when clicked
  const submitHandler = sendCheckinRequest.bind(checkinButton);
  checkinButton.addEventListener("click", submitHandler);
  // Set an interval to update the button text with the remaining time
  setTimeRemainingWatch(expirationTime, checkinExpirationElement);

  checkinFormPlaceholder.replaceWith(checkinFormContent);

  // update the title of the page so the client can see this across tabs
  addTitlePrefix("[Checkin NOW!]");
}

/**
 * Updates the user's position in queue text, as well as the page's title.
 *
 * @param {number} position - the position in queue
 * @returns {void}
 * @description
 * This function updates the queue position text with the current position of the party.
 * It also updates the title with that position so that the client can see their position
 * from other tabs.
 */
function handleQueuePositionUpdate(position) {
  queuePositionTextElement.textContent = position;
  addTitlePrefix(`[Queue: ${position}]`);
}

/**
 * Renders a checkin expired notice, with a link back to the join waitlist page
 *
 * @returns {void}
 * @description
 * This function removes any other notices on the page, then renders a notice
 * indicating that the user's check-in window has expired.
 *
 * The notice will be displayed in place of the check-in form,
 * and will be used after the user has waited too long to check in and the
 * server has sent a message indicating that the check-in window has expired.
 * The user is given a link back to the waitlist page so they can try again.
 */
function handleCheckinExpired() {
  removeOtherNotices();
  const checkinExpiredNotice = checkinExpiredTemplate.content.cloneNode(true);
  checkinExpiredPlaceholder.replaceWith(checkinExpiredNotice);
  eventSource?.close();

  addTitlePrefix("[Checkin Expired!]");
}

/**
 * Creates a notice to inform the user that they have left the queue, then
 * redirects them back to the create party page.
 *
 * @returns {void}
 * @description
 * Creates a leave queue success notice and informs the user that they will
 * be redirected back to the create party page.
 * Sets a timeout that then redirects the client back to the create party page.
 */
function addLeaveQueueSuccessNotice() {
  removeOtherNotices();
  const leaveQueueSuccessNotice = document.createElement("p");
  leaveQueueSuccessNotice.classList.add("leave-queue-success");
  leaveQueueSuccessNotice.setAttribute("data-testid", "leave-queue-notice");
  leaveQueueSuccessNotice.textContent = "You have successfully left the queue.";
  leaveQueueSuccessNotice.setAttribute("role", "alert");
  partyIDContainer.after(leaveQueueSuccessNotice);

  const redirectNotice = document.createElement("p");
  redirectNotice.classList.add("redirect-notice");
  redirectNotice.textContent =
    "You will be redirected to the join waitlist page in 5 seconds.";
  leaveQueueSuccessNotice.after(redirectNotice);

  // redirect the user back to the waitlist page after 5 seconds
  setTimeout(() => {
    window.location.replace("/party/new");
  }, 5000);
}

/**
 * Renders a notice that the user has successfully checked in.
 *
 * @returns {void}
 * @description
 * This function removes any other notices on the page, then renders a notice
 * indicating that the user has successfully checked in. The notice will be
 * displayed in place of the check-in form, and will be used after the
 * user has clicked the checkin button and the server has confirmed that the
 * user has been checked in successfully.
 */
function addCheckinSuccessNotice() {
  removeOtherNotices();
  const checkinSuccessNotice = checkinSuccessTemplate.content.cloneNode(true);
  checkinSuccessPlaceholder.replaceWith(checkinSuccessNotice);
}

/**
 * Renders a notice that no party, and the user should return
 * to the waitlist page.
 *
 * @returns {void}
 * @description
 * This function removes any other notices on the page, then renders a notice
 * indicating that no party was found. The user is given a link back to the
 * waitlist page so they can try again.
 */
function addNoPartyNotice() {
  removeOtherNotices();
  const noPartyNotice = noPartyNoticeTemplate.content.cloneNode(true);
  noPartyNoticePlaceholder.replaceWith(noPartyNotice);
}

/**
 * Parses to and responds to an event message from the event stream based on
 * the status.
 *
 * @param {MessageEvent} event - an event stream message from the server
 * @returns {void}
 */
function onEventMessage(event) {
  /** @type {EventMessage} */
  const data = JSON.parse(event.data);

  switch (data.status) {
    case eventStatuses.UNQUEUED_CLIENT:
      // if the party is not queued or seated, show this notice
      // this is a fallback edge case, as the initial visit to the page
      // should handle any redirecting before hand
      eventSource?.close();
      addNoPartyNotice();
      return;

    case eventStatuses.CAN_DEQUEUE:
      handleCheckedInReady(data.checkingInExpiration);
      return;

    case eventStatuses.QUEUE_POSITION_UPDATE:
      handleQueuePositionUpdate(data.position);
      return;

    case eventStatuses.CHECKIN_WINDOW_EXPIRED:
      handleCheckinExpired();
      return;
  }
}

/**
 * Renders an event error if one occurs, offering the client a link back
 * to the waitlist page.
 *
 * @param {EventMessage} event
 * @returns {void}
 * @description
 * This function is called when an error occurs in the event source.
 * It logs the error to the console, removes any other notices on the page,
 * and renders an error notice to the user indicating that there was an issue
 * with the event stream. The user is given a link back to the waitlist page
 * so they can try again.
 */
function onEventError(event) {
  console.error("EventSource error: ", event);

  removeOtherNotices();
  const eventError = eventErrorTemplate.content.cloneNode(true);
  eventErrorPlaceholder.replaceWith(eventError);
}

/**
 * Connects to the event endpoint streamed by the server, allowing
 * for live updates from the server about the client's position in queue
 * and when they can check in.
 *
 * @returns {void}
 * @description
 * This function checks if the party is seated and if so, returns early.
 *
 * If the event source is already connected, it will close the previous connection
 * before establishing a new one.
 *
 * The event source will listen for messages from the server and handle them accordingly,
 * such as updating the UI with the user's position in queue, when they can check in,
 * or if their check-in window has expired.
 */
function connectToEvents() {
  // Do not connect to the event stream if seated already
  if (window.isSeated) return;

  if (eventSource) {
    console.warn(
      "Already connected to event stream, closing previous connection",
    );
    eventSource.close();
  }

  eventSource = new EventSource(`${ENDPOINT_EVENT_STREAM}`);

  eventSource.onmessage = onEventMessage;
  eventSource.onerror = onEventError;
  eventSource.onopen = (_event) => {
    console.log("Connected to event stream");
  };
}

if (leaveQueueButton) {
  leaveQueueButton.addEventListener("click", sendLeaveQueueRequest);
}

connectToEvents();
