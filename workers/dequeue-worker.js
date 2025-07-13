/**
 * @file This file sets up the worker in charge of calling the dequeue service
 * in order to dequeue parties from the waitlist.
 */
import "../config/load-config.js";
import { DEQUEUE_QUEUE } from "../constants/message-queues.js";
import { Worker } from "bullmq";
import dequeueService from "../services/dequeue-service.js";
import logger from "../utils/logger.js";
import redis from "../utils/redis.js";

const connection = redis.createRedisClient({ maxRetriesPerRequest: null });

const worker = new Worker(
  DEQUEUE_QUEUE,
  async (job) => {
    logger.info("[Dequeue worker]: received job - ", job.id);
    await dequeueService.dequeueUsers();
  },
  { connection },
);

worker.on("ready", async () => {
  logger.info("[Dequeue worker]: is ready to process jobs");

  // Initial check for parties to dequeue when the worker starts
  await dequeueService.dequeueUsers();
  logger.info("[Dequeue worker]: initial dequeue check completed");
});

worker.on("completed", (job) => {
  logger.info(`[Dequeue worker]: ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  logger.info(`[Dequeue worker]: ${job.id} has failed with ${err.message}`);
});
