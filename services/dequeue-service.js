import parties from "../models/parties.js";
import {
  CACHE_QUEUED_PARTY_POSITIONS,
  CHANNEL_DEQUEUE,
  CHANNEL_QUEUE_POSITIONS,
} from "../constants/pub-sub-channels.js";
import scheduleJobAt from "../utils/schedule-job.js";
import { CHECKIN_EXPIRED_QUEUE } from "../constants/message-queues.js";
import redisHandler from "../utils/redis.js";

/**
 * @import Redis from 'ioredis';
 */

/**
 * This function handles the dequeue updates for parties based on the available seats.
 *
 * @param {number} availableSeats - the number of available seats to dequeue parties for
 * @param {Redis} redis - a redis instance
 * @returns {Promise<[string|null, string|null]>}
 * a tuple where
 * - the first element is an error message if there was an error, or null if there was no error
 * - the second element is a message indicating the result of the dequeue operation, or null if an error occurred
 * @private
 * @description
 * This function retrieves parties that can be dequeued based on the available seats.
 * It sets their checking-in status and schedules a job to handle check-in expiration.
 * It then publishes the dequeued parties to a Redis channel.
 */
async function handleDequeueUpdates(availableSeats, redis) {
  const [toDequeuePartyIDsError, toDequeuePartyIDs] =
    await parties.getPartiesToDequeue(availableSeats);
  if (toDequeuePartyIDsError) return [toDequeuePartyIDsError, null];
  if (toDequeuePartyIDs.length < 1) return [null, "No users in queue"];

  // set those parties' checking-in status and get when that checkin-status will expire
  const [checkingInExpirationError, checkingInExpiration] =
    await parties.setCheckingInStatus(toDequeuePartyIDs);
  if (checkingInExpirationError) return [checkingInExpirationError, null];
  // in this case, there's not been any parties updated
  if (!checkingInExpiration) return [null, "No parties updated"];

  // schedule a worker to handle users who did not check-in by the expiration
  const checkinExpiredCleanupTime = new Date(checkingInExpiration);
  const queue = redisHandler.createQueue(CHECKIN_EXPIRED_QUEUE);
  await scheduleJobAt(
    queue,
    "expire-checking-in-users",
    {},
    checkinExpiredCleanupTime,
  );

  // publish the dequeued parties to the redis channel
  const dequeuedPartiesMessage = JSON.stringify({
    partyIDs: toDequeuePartyIDs,
    checkingInExpiration,
  });
  await redis.publish(CHANNEL_DEQUEUE, dequeuedPartiesMessage);

  return [null, "Dequeued parties successfully"];
}

/**
 * This function dequeues users from the queue based on the available seats.
 *
 * @returns {Promise<[string|null, string|null]>}
 * a tuple where
 * - the first value is a string error code if an error occurred, and null otherwise
 * - the second value is a string with a success message if no error occurred, and null otherwise
 * @description
 * This function first retrieves the number of available seats.
 * If there are available seats, it retrieves parties that can be dequeued,
 * sets their checking-in status, and schedules a job to handle check-in expiration.
 *
 * It then publishes the dequeued parties to a Redis channel.
 *
 * Finally, it retrieves the updated queue positions and broadcasts them to clients.
 * If any errors occur during these operations, they are returned.
 */
async function dequeueUsers() {
  // first get the number of seats available
  const [availableSeatsError, availableSeats] =
    await parties.getAvailableSeatCount();
  if (availableSeatsError) return [availableSeatsError, null];

  const redisClient = redisHandler.createRedisClient();

  if (availableSeats > 0) {
    // this gets the parties whose sizes can cumulatively add up to the available seats,
    // then sets their checking-in status and when that status will expire
    // broadcasts the dequeued parties to the CHANNEL_DEQUEUE channel
    // Note: there is likely some minor optimization around here, since we get the parties to dequeue only,
    const [dequeueUpdateError, _result] = await handleDequeueUpdates(
      availableSeats,
      redisClient,
    );
    if (dequeueUpdateError) return [dequeueUpdateError, null];
  }
  // get the updated queued positions
  // Note: positional optimization here (see above note)
  const [queuedPartyPositionsError, queuedPartyPositions] =
    await parties.getCurrentQueuePositions();
  if (queuedPartyPositionsError) return [queuedPartyPositionsError, null];

  // add the queue positions to a set for any clients not yet subscribed
  const queuedPositionsMessage = JSON.stringify({
    queuedParties: queuedPartyPositions,
  });
  await redisClient.set(CACHE_QUEUED_PARTY_POSITIONS, queuedPositionsMessage);

  // broadcast the new queued parties' positions so that these can be relayed to subscribed clients
  await redisClient.publish(CHANNEL_QUEUE_POSITIONS, queuedPositionsMessage);

  return [null, "Dequeue successfully complete"];
}

export default {
  dequeueUsers,
};
