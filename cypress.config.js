import { defineConfig } from "cypress";
import "./config/load-config.js";
import { seedParties } from "./tests/utils/party.js";
import db from "./models/db.js";
import dequeueService from "./services/dequeue-service.js";
import checkinExpiredService from "./services/checkin-expired-service.js";
import { MAX_SEATS } from "./config/waitlist.js";

const port = process.env.PORT || 3000;
const baseUrl = `http://localhost:${port}`;

// this is to help ensure that we do not reset the DB in any other mode
if (process.env.NODE_ENV !== "test") {
  console.error("NOT IN TEST MODE");
  console.error("Please set NODE_ENV to `test`");
  process.exit(1);
}

export default defineConfig({
  e2e: {
    baseUrl,
    screenshotOnRunFailure: false,
    setupNodeEvents(on, _config) {
      // implement node event listeners here
      on("task", {
        resetDB: async () => {
          return await db("parties").truncate();
        },

        destroyDB: async () => {
          return await db.destroy();
        },

        seedUsers: async (
          numberOfParties,
          sizePerParty,
          additionalProperties = {},
        ) => {
          return await seedParties(
            numberOfParties,
            sizePerParty,
            additionalProperties,
          );
        },

        dequeueUsersService: async () => {
          await dequeueService.dequeueUsers();
          return true;
        },

        expireCheckins: async () => {
          return await db("parties").update({
            checkin_expiration: db.fn.now(),
          });
        },

        checkinExpiredService: async () => {
          await checkinExpiredService.expireCheckedinUsers();
          return true;
        },

        // fill the queue with a number of parties
        fillQueue: async (numberOfParties) => {
          return await seedParties(numberOfParties, MAX_SEATS);
        },
      });
    },
  },
});
