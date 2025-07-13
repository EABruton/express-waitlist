import { jest } from "@jest/globals";
import db from "../../models/db.js";
import { getPartiesByIDs, seedParties } from "../utils/party.js";
import { STATUS_CHECKING_IN } from "../../constants/party-statuses.js";
import { CHANNEL_CHECKING_IN_EXPIRED } from "../../constants/pub-sub-channels.js";
import { DEQUEUE_QUEUE } from "../../constants/message-queues.js";

const mockRedisSet = jest.fn();
const mockRedisPublish = jest.fn();
const mockCreateQueue = jest.fn();
const mockQueueAdd = jest.fn();
jest.unstable_mockModule("../../utils/redis.js", () => ({
  default: {
    createRedisClient: () => ({
      set: mockRedisSet,
      publish: mockRedisPublish,
    }),
    createQueue: mockCreateQueue,
  },
}));
const { default: checkinExpiredService } = await import(
  "../../services/checkin-expired-service.js"
);

beforeEach(async () => {
  jest.clearAllMocks();
  mockRedisSet.mockReset();
  mockRedisPublish.mockReset();
  mockCreateQueue.mockReset();
  mockCreateQueue.mockImplementation(() => ({
    add: mockQueueAdd,
  }));

  await db("parties").truncate();
});

afterAll(async () => {
  await db.destroy();
});

describe("checkin expired service", () => {
  it("should delete parties, notify clients, and schedule a dequeue if parties' check-in time has expired", async () => {
    // arrange: create checking-in users with expired checking in times
    const parties = await seedParties(5, 5, {
      status: STATUS_CHECKING_IN,
      checkin_expiration: new Date(
        Date.now() - 1000 * 24 * 60 * 60,
      ).toISOString(),
    });
    const partyIDs = parties.map((party) => party.party_id);

    // act: call the checkin-expired service
    await checkinExpiredService.expireCheckedinUsers();

    // assert: those parties no longer exists in the database
    const updatedParties = await getPartiesByIDs(partyIDs);
    expect(updatedParties).toHaveLength(0);
    // a message of the expired users is broadcast
    const checkinExpiredCall = mockRedisPublish.mock.lastCall;
    const checkinExpiredMessage = JSON.parse(checkinExpiredCall[1]);

    expect(checkinExpiredCall[0]).toBe(CHANNEL_CHECKING_IN_EXPIRED);
    expect(checkinExpiredMessage["partyIDs"]).toEqual(
      expect.arrayContaining(partyIDs),
    );
    // the dequeue service is triggered
    expect(mockCreateQueue).toHaveBeenCalledWith(DEQUEUE_QUEUE);
  });

  it("should not delete parties if check-in time has not expired", async () => {
    // arrange: create checking-in users with expired checking in times
    const parties = await seedParties(5, 5, {
      status: STATUS_CHECKING_IN,
      checkin_expiration: new Date(
        Date.now() + 1000 * 24 * 60 * 60,
      ).toISOString(),
    });
    const partyIDs = parties.map((party) => party.party_id);

    // act: call the checkin-expired service
    await checkinExpiredService.expireCheckedinUsers();

    // assert: the checking-in parties are not removed from the database
    const updatedParties = await getPartiesByIDs(partyIDs);
    expect(updatedParties).toHaveLength(partyIDs.length);
  });
});
