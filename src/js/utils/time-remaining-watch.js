/**
 * Calculates the time remaining until the expiration time
 *
 * @param {number} expirationTime - the expiration time in milliseconds
 * @returns {number} - the time remaining in seconds
 * @private
 * @description
 * This function calculates the time remaining until the expiration time.
 * It takes the current time and subtracts it from the expiration time, then
 * returns the time remaining in seconds. If the time remaining is less than or equal to 0,
 * it returns 0.
 */
function getTimeRemaining(expirationTime) {
  const now = Date.now();
  const timeLeft = expirationTime - now;
  if (timeLeft <= 0) {
    return 0;
  }
  return Math.ceil(timeLeft / 1000); // return seconds left
}

/**
 * Sets a timer to update the text content of an element with the remaining time
 *
 * @param {number} expirationTime - the expiration time in milliseconds
 * @param {HTMLElement} timeRemainingElement - the element to update with the remaining time
 * @param {HTMLButtonElement} timeRemainingButton - the button to disable when the time expires
 * @returns {void}
 * @description
 * This function sets an interval to update the text content of the element with the remaining time
 * until the expiration time is reached. It will update the text content every second, and when
 * the expiration time is reached, it will clear the interval and set the text content to '00'.
 */
export default function setTimeRemainingWatch(
  expirationTime,
  timeRemainingElement,
  timeRemainingButton,
) {
  const formatSecondsLeft = (secondsLeft) => {
    return secondsLeft.toString().padStart(2, "0") + " s";
  };

  const interval = setInterval(() => {
    const secondsLeft = getTimeRemaining(expirationTime);
    if (secondsLeft <= 0) {
      clearInterval(interval);
      // since the element is replaced on the page, we have to check if the button exists
      if (timeRemainingButton) timeRemainingButton.disabled = true;
      timeRemainingElement.textContent = "00 s";
      return;
    }
    // Update the text content of the element with the remaining seconds
    timeRemainingElement.textContent = formatSecondsLeft(secondsLeft);
  }, 1000);

  // Set the initial text content
  const initialSecondsLeft = getTimeRemaining(expirationTime);
  if (initialSecondsLeft <= 0) {
    // since the element is replaced on the page, we have to check if the button exists
    if (timeRemainingButton) timeRemainingButton.disabled = true;
    timeRemainingElement.textContent = "00 s";
  } else {
    // Update the text content of the element with the initial seconds left
    timeRemainingElement.textContent = formatSecondsLeft(initialSecondsLeft);
  }
}
