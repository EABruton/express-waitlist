/**
 * @file This file is in charge of providing functions to setup a pre-configured redis
 * client and worker queue.
 */
import { Queue } from "bullmq";
import config from "../config/message-queues.js";
import logger from "./logger.js";
import Redis from "ioredis";

/**
 * Creates a redis client with custom config for publishing to worker channels.
 * Sets up connect listeners and error listeners for logging when the client is created.
 *
 * @param {object} customConfig - additional configuration options for a redis client
 * @returns {Redis} the configured redis client
 */
function createRedisClient(customConfig = {}) {
  const client = new Redis({ ...config, ...customConfig });

  client.on("error", (err) => {
    logger.error("Redis Command Client Error", err);
  });

  client.on("connect", () => {
    logger.info(
      `Redis Command Client connected to ${config.host}:${config.port}`,
    );
  });

  return client;
}

/**
 * Creates a queue for a worker using the application connection options.
 *
 * @param {string} queueName - the name of the queue
 * @returns {Queue} a preconfigured queue
 */
function createQueue(queueName) {
  const queue = new Queue(queueName, { connection: config });
  return queue;
}

export default {
  createRedisClient,
  createQueue,
};
