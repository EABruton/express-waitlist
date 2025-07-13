import parties from "../models/parties.js";
import { CHANNEL_CHECKING_IN_EXPIRED } from "../constants/pub-sub-channels.js";
import { DEQUEUE_QUEUE } from "../constants/message-queues.js";
import redis from "../utils/redis.js";

/**
 * This service is responsible for removing users from the database who
 * are set to "checking_in", but have not checked in within the expiry period
 * (indicating that they do not intend to do so).
 *
 * @returns {Promise<void>}
 * @description
 * Deletes parties whose status are checking in and whose checkin expiry period are overdue.
 * If any parties are deleted, broadcasts those parties' IDs,
 * then adds a dequeue job to the dequeue queue (as the queue can now shift forward).
 */
async function expireCheckedinUsers() {
  // get all the party IDs of parties that were deleted
  const [expiredIDsErrors, expiredIDs] =
    await parties.deleteCheckingInExpiredParties();
  if (expiredIDsErrors) return [expiredIDsErrors, expiredIDs];

  // broadcast the IDs of clients whose party IDs were expired
  const message = JSON.stringify({ partyIDs: expiredIDs });
  const redisClient = redis.createRedisClient();
  await redisClient.publish(CHANNEL_CHECKING_IN_EXPIRED, message);

  // call the dequeue worker to shift the queue
  const queue = redis.createQueue(DEQUEUE_QUEUE);
  await queue.add("dequeue");
}

export default {
  expireCheckedinUsers,
};
