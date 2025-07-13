import { jest } from "@jest/globals";
import db from "../../models/db.js";
import { getPartiesByIDs, seedParties } from "../utils/party.js";
import { MAX_SEATS } from "../../config/waitlist.js";
import {
  STATUS_CHECKING_IN,
  STATUS_QUEUED,
  STATUS_SEATED,
} from "../../constants/party-statuses.js";
import {
  CACHE_QUEUED_PARTY_POSITIONS,
  CHANNEL_DEQUEUE,
  CHANNEL_QUEUE_POSITIONS,
} from "../../constants/pub-sub-channels.js";
import { CHECKIN_EXPIRED_QUEUE } from "../../constants/message-queues.js";

const mockRedisSet = jest.fn();
const mockRedisPublish = jest.fn();
const mockCreateQueue = jest.fn();
jest.unstable_mockModule("../../utils/redis.js", () => ({
  default: {
    createRedisClient: () => ({
      set: mockRedisSet,
      publish: mockRedisPublish,
    }),
    createQueue: mockCreateQueue,
  },
}));

const mockScheduleJobAt = jest.fn();
jest.unstable_mockModule("../../utils/schedule-job.js", () => ({
  default: mockScheduleJobAt,
}));

const { default: dequeueService } = await import(
  "../../services/dequeue-service.js"
);

beforeEach(async () => {
  jest.clearAllMocks();
  mockRedisSet.mockReset();
  mockRedisPublish.mockReset();
  mockCreateQueue.mockReset();
  mockScheduleJobAt.mockReset();

  await db("parties").truncate();
});

afterAll(async () => {
  await db.destroy();
});

describe("dequeue users", () => {
  it("should dequeue parties, update their status, and notify clients if seats are available", async () => {
    // arrange: create a batch of queued users
    // we'll say we want 2 parties dequeued, so we'll take the max seats and divide it
    const dequeueCount = 2;
    const partySize = Math.floor(MAX_SEATS / dequeueCount);
    const parties = await seedParties(MAX_SEATS * 3, partySize, {
      status: STATUS_QUEUED,
    });
    const partyIDs = parties.map((party) => party.party_id);

    // get the first few users who will fit in that batch
    const expectedDequeued = parties.slice(0, dequeueCount);
    const expectedDequeuedIDs = expectedDequeued.map((party) => party.party_id);
    const expectedQueuedIDs = partyIDs.filter(
      (partyID) => !expectedDequeuedIDs.includes(partyID),
    );

    // act: run the dequeue service
    await dequeueService.dequeueUsers();

    // assert: make sure that only those parties who should have their statuses updated are updated to checking in
    const updatedParties = await getPartiesByIDs(partyIDs);
    for (const party of updatedParties) {
      if (expectedDequeuedIDs.includes(party.party_id)) {
        expect(party.status).toBe(STATUS_CHECKING_IN);
        continue;
      }
      expect(party.status).toBe(STATUS_QUEUED);
    }

    // schedules checkin-expired queue cleanup
    expect(mockCreateQueue).toHaveBeenCalledWith(CHECKIN_EXPIRED_QUEUE);

    // publishes a message to dequeue parties
    const publishCalls = mockRedisPublish.mock.calls;
    const dequeueCall = publishCalls.find(
      (call) => call[0] === CHANNEL_DEQUEUE,
    );

    // verify that the dequeued party ID is in the dequeue call
    // we won't verify an object match as that's too implementation-detail specific
    expect(dequeueCall).not.toBeUndefined();
    const dequeueCallJSON = JSON.parse(dequeueCall[1]);
    const dequeuedIDs = dequeueCallJSON["partyIDs"].map(
      (party) => party.party_id,
    );
    expect(dequeuedIDs).toEqual(expect.arrayContaining(expectedDequeuedIDs));

    // caches queued positions
    const setCacheCall = mockRedisSet.mock.calls[0];
    expect(setCacheCall[0]).toBe(CACHE_QUEUED_PARTY_POSITIONS);

    // broadcasts queued positions
    const queueUpdateCall = publishCalls.find(
      (call) => call[0] === CHANNEL_QUEUE_POSITIONS,
    );
    expect(queueUpdateCall).not.toBeUndefined();

    const queueUpdateCallJSON = JSON.parse(queueUpdateCall[1]);
    const queuedIDs = queueUpdateCallJSON["queuedParties"].map(
      (party) => party.party_id,
    );
    expect(queuedIDs).toEqual(expect.arrayContaining(expectedQueuedIDs));
  });

  it("should not dequeue parties if seats are not available", async () => {
    // arrange: create checkin-in and seated users enough to fill max seats
    const halfMaxSeats = Math.floor(MAX_SEATS / 2);
    await seedParties(1, halfMaxSeats, {
      status: STATUS_SEATED,
      seat_expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    });
    await seedParties(1, halfMaxSeats, { status: STATUS_CHECKING_IN });
    // create queued users
    const queuedParties = await seedParties(3, 2, { status: STATUS_QUEUED });
    const queuedPartyIDs = queuedParties.map((party) => party.party_id);

    // act: run the dequeue service
    await dequeueService.dequeueUsers();

    // assert: verify no queued party's status was changed
    const updatedQueuedParties = await getPartiesByIDs(queuedPartyIDs);
    for (const party of updatedQueuedParties) {
      expect(party.status).toBe(STATUS_QUEUED);
    }

    // the checkin expired and dequeue dequeue queues are not called
    expect(mockCreateQueue).not.toHaveBeenCalledWith(CHECKIN_EXPIRED_QUEUE);
    expect(mockRedisPublish).not.toHaveBeenCalledWith(CHANNEL_DEQUEUE);
  });
});
