/**
 * @file This file sets up the checkin-expired worker, which handles calling
 * the checkin expired service to remove users from the database if they have
 * not checked in within a certain time frame of being dequeued.
 */
import "../config/load-config.js";
import { CHECKIN_EXPIRED_QUEUE } from "../constants/message-queues.js";
import { Worker } from "bullmq";
import checkingInExpireService from "../services/checkin-expired-service.js";
import logger from "../utils/logger.js";
import redis from "../utils/redis.js";

const connection = redis.createRedisClient({ maxRetriesPerRequest: null });

const worker = new Worker(
  CHECKIN_EXPIRED_QUEUE,
  async (job) => {
    logger.info("[Checkin expired worker]: received job - ", job.id);
    await checkingInExpireService.expireCheckedinUsers();
  },
  { connection },
);

worker.on("ready", async () => {
  logger.info("[Checkin expired worker]: is ready to process jobs");

  // Initial check for expired check-ins when the worker starts
  await checkingInExpireService.expireCheckedinUsers();
  logger.info(
    "[Checkin expired worker]: initial check-in expiration check completed",
  );
});

worker.on("completed", (job) => {
  logger.info(`[Checkin expired worker]: ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  logger.info(
    `[Checkin expired worker]: ${job.id} has failed with ${err.message}`,
  );
});
