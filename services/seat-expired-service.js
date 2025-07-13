import redis from "../utils/redis.js";
import parties from "../models/parties.js";
import { DEQUEUE_QUEUE } from "../constants/message-queues.js";

/**
 * This function handles the removal of expired seats from the database.
 *
 * @returns {Promise<[string|null, string[]|null]>}
 * a tuple where
 * - the first value is a string with an error code if an error occurred or null otherwise
 * - the second value is a list of party IDs that were removed if successful or null otherwise
 * @description
 * This function checks for expired seats in the database and removes them.
 * If any seats are removed, adds a job to the dequeue channel so that the queue can
 * shift forward.
 */
async function expireSeats() {
  const [removeSeatsError, removeSeats] = await parties.removeExpiredSeats();
  if (removeSeatsError) return [removeSeatsError, null];

  // If seats were removed, add a job to the dequeue queue to shift the queue
  if (removeSeats.length > 0) {
    const queue = redis.createQueue(DEQUEUE_QUEUE);
    queue.add("dequeue-party");
  }

  return [null, removeSeats];
}

export default {
  expireSeats,
};
