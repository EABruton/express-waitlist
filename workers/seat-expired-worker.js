/**
 * @file This file sets up the worker for running the seat expired service,
 * which handles removing users from the database with expired seats.
 */
import "../config/load-config.js";
import { SEAT_EXPIRED_QUEUE } from "../constants/message-queues.js";
import { Worker } from "bullmq";
import logger from "../utils/logger.js";
import redis from "../utils/redis.js";
import seatExpiredService from "../services/seat-expired-service.js";

const connection = redis.createRedisClient({ maxRetriesPerRequest: null });

const worker = new Worker(
  SEAT_EXPIRED_QUEUE,
  async (job) => {
    logger.info("[Seat Expired Worker]: received job - ", job.id);
    await seatExpiredService.expireSeats();
  },
  { connection },
);

worker.on("ready", async () => {
  logger.info("[Seat expired worker]: is ready to process jobs");

  // Initial check for expired seats when the worker starts
  await seatExpiredService.expireSeats();
  logger.info("[Seat expired worker]: initial seat expiration check completed");
});

worker.on("completed", (job) => {
  logger.info(`[Seat expired worker]: ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  logger.info(
    `[Seat expired worker]: ${job.id} has failed with ${err.message}`,
  );
});
