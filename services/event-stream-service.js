/**
 * @file This file is responsible for bridging messages received from
 * subscribed Redis channels to the client (if relevant) via server-sent events.
 */
import eventStatuses from "../shared-constants/event-statuses.js";
import { STATUS_CHECKING_IN } from "../constants/party-statuses.js";
import {
  CACHE_QUEUED_PARTY_POSITIONS,
  CHANNEL_CHECKING_IN_EXPIRED,
  CHANNEL_DEQUEUE,
  CHANNEL_QUEUE_POSITIONS,
} from "../constants/pub-sub-channels.js";
import formatEventStreamMessage from "../utils/format-event-stream-message.js";
import logger from "../utils/logger.js";
import redis from "../utils/redis.js";

/**
 * @import { ExpressResponse, Party } from '../typedefs.js';
 * @import Redis from 'ioredis';
 */

/**
 * Sends a server-sent event message to indicating that the client can dequeue.
 *
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {string} checkingInExpiration - the expiration time for the checking-in status
 * @returns {void}
 * @private
 * @description
 * This function formats the event stream message with the dequeue status and time of checkin expiration
 * and writes it to the response stream.
 */
const sendDequeueMessage = (response, checkingInExpiration) =>
  response.write(
    formatEventStreamMessage({
      status: eventStatuses.CAN_DEQUEUE,
      checkingInExpiration,
    }),
  );

/**
 * Sends a server-sent event message to indicate the client's position in the queue.
 *
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Object} row - The row data containing the queue position.
 * @returns {void}
 * @private
 * @description
 * This function formats the event stream message with the queue position update
 * and writes it to the response stream.
 */
const sendQueuePositionMessage = (response, row) =>
  response.write(
    formatEventStreamMessage({
      status: eventStatuses.QUEUE_POSITION_UPDATE,
      position: row,
    }),
  );

/**
 * Handler for the dequeue channel that lets the client know that they can check in.
 *
 * @param {string} message - a message from a the dequeue redis channel
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Party} party - the client's party
 * @param {Redis} redis - a redis instance
 * @returns {Promise<void>}
 * @private
 * @description
 * This function checks if the partyID is included in the message's partyIDs.
 * If it is, it sends a message to the client indicating that they can dequeue.
 * It then unsubscribes from the CHANNEL_DEQUEUE and CHANNEL_QUEUE_POSITIONS channels.
 */
async function dequeueChannelHandler(message, response, party, redis) {
  const { partyIDs, checkingInExpiration } = JSON.parse(message);
  if (partyIDs.includes(party.party_id)) {
    sendDequeueMessage(response, checkingInExpiration);
    await redis.unsubscribe(CHANNEL_DEQUEUE, CHANNEL_QUEUE_POSITIONS);
  }
}

/**
 * Handler for the queue position channel that lets the client know their updated position in queue.
 *
 * @param {string} message - a message from the queue positions redis channel or redis cache
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Party} party - the client's party
 * @returns {void}
 * @private
 * @description
 * This function checks if the message contains queued parties and finds the client's party ID.
 * If found, it sends the client's updated queue position to the client.
 */
async function queuePositionHandler(message, response, party) {
  const { queuedParties } = JSON.parse(message);
  if (!queuedParties || queuedParties.length < 1) {
    logger.warn("No queued parties received in queue position channel");
    return;
  }

  const clientRow = queuedParties.find(
    (queuedParty) => queuedParty.partyID === party.party_id,
  );
  // if the client is not found in the queue, the dequeue service hasn't updated yet, so we skip
  // updating positions
  if (!clientRow) {
    logger.warn(
      `Unqueued client received queue position event. Party ID: ${party.party_id}`,
    );
    return;
  }
  // send the client's updated position
  const { row } = clientRow;
  sendQueuePositionMessage(response, row);
}

/**
 * Handler for the checkin expired channel that lets the client know that their check-in time has expired.
 *
 * @param {string} message - a message from a the checkin expired redis channel
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Party} party - the client's party
 * @param {Redis} redis - a redis instance
 * @returns {Promise<void>}
 * @private
 * @description
 * This function checks if the partyID is included in the message's partyIDs.
 * If it is, it sends a message to the client indicating that the checkin window has expired.
 * It then unsubscribes from the CHANNEL_CHECKING_IN_EXPIRED and CHANNEL_QUEUE_POSITIONS channel.
 */
async function checkinExpiredChannelHandler(message, response, party, redis) {
  const { partyIDs } = JSON.parse(message);

  if (partyIDs.includes(party.party_id)) {
    const data = { status: eventStatuses.CHECKIN_WINDOW_EXPIRED };
    response.write(formatEventStreamMessage(data));

    await redis.unsubscribe(
      CHANNEL_CHECKING_IN_EXPIRED,
      CHANNEL_QUEUE_POSITIONS,
    );
    response.end(); // End the response stream after sending the message
  }
}

/**
 * Subscribes to redis message channels.
 *
 * @param {Redis} redis
 * @returns {Promise<void>}
 * @private
 * @description
 * This function subscribes to the redis channels that are used for event streaming.
 * It also logs the success or failure of the subscription.
 */
async function subscribeToChannels(redis) {
  redis.subscribe(
    CHANNEL_DEQUEUE,
    CHANNEL_CHECKING_IN_EXPIRED,
    CHANNEL_QUEUE_POSITIONS,
    (subscribeError, count) => {
      if (subscribeError) {
        logger.error("Failed to subscribe:", subscribeError.message);
      } else {
        logger.info(`Successfully connected to ${count} channels`);
      }
    },
  );
}

/**
 * Attaches different message handlers based on the channel the message came from.
 *
 * @param {Redis} redis - a redis instance
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Party} party - the client's party
 * @returns {void}
 * @private
 * @description
 * This function listens for messages on the redis channels and calls the appropriate handler
 * based on the channel the message came from. It handles messages for dequeuing parties,
 * checking in expired parties, and queue positions.
 */
function setupMessageHandlers(redis, response, party) {
  redis.on("message", (channel, message) => {
    if (channel === CHANNEL_DEQUEUE) {
      dequeueChannelHandler(message, response, party, redis);
    }
    if (channel === CHANNEL_CHECKING_IN_EXPIRED) {
      checkinExpiredChannelHandler(message, response, party, redis);
    }
    if (channel === CHANNEL_QUEUE_POSITIONS) {
      queuePositionHandler(message, response, party);
    }
  });
}

/**
 * Passes initial messages to the client when they connect to the event stream.
 *
 * @param {Party} partyData - the client's party
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @param {Redis} redis - a redis instance
 * @param {Redis} redisSubscriber - a redis instance for pub/sub
 * @returns {Promise<void>}
 * @private
 * @description
 * This function checks if there are any messages in the redis cache that should be sent to the
 * client when they first connect to the event stream. It checks for dequeued parties and queued
 * party positions, and sends them to the client if they exist.
 */
async function passInitialMessages(
  partyData,
  response,
  redis,
  redisSubscriber,
) {
  if (partyData.status === STATUS_CHECKING_IN && partyData.checkin_expiration) {
    // If the party is checking in, we can send the checkin expiration time
    sendDequeueMessage(response, partyData.checkin_expiration);
    await redisSubscriber.unsubscribe(CHANNEL_DEQUEUE, CHANNEL_QUEUE_POSITIONS);
  }

  // send the party's current position in queue
  const queuedPartyPositionsMessage = await redis.get(
    CACHE_QUEUED_PARTY_POSITIONS,
  );
  if (queuedPartyPositionsMessage) {
    queuePositionHandler(queuedPartyPositionsMessage, response, partyData);
  }
}

/**
 * Handles the creation, transformation, and streaming of event information
 * from redis to the client's event stream.
 *
 * @param {Party} partyData - the client's party
 * @param {ExpressResponse} response - the response for the request, allowing access to streaming events to the client
 * @returns {Promise<void>}
 * @description
 * This function sets up the event stream for the client by subscribing to the necessary redis channels,
 * setting up message handlers, and passing any initial messages that may have been cached.
 * It allows the client to receive real-time updates about their queue position, dequeuing status,
 * and check-in expiration status.
 */
async function setupStream(partyData, response) {
  // Note: we use a separate redis instance for pub/sub to avoid conflicts with commands
  // that might be executed while listening to channels.
  const redisClient = redis.createRedisClient(); // for commands
  const redisSubscriber = redis.createRedisClient(); // for pub/sub
  await subscribeToChannels(redisSubscriber);
  setupMessageHandlers(redisSubscriber, response, partyData);
  await passInitialMessages(partyData, response, redisClient, redisSubscriber);
}

export default {
  setupStream,
};
