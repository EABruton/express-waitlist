import { jest } from "@jest/globals";
import db from "../../models/db.js";
import { getPartiesByIDs, seedParties } from "../utils/party.js";
import { STATUS_SEATED } from "../../constants/party-statuses.js";
import { DEQUEUE_QUEUE } from "../../constants/message-queues.js";

const mockCreateQueue = jest.fn();
const mockQueueAdd = jest.fn();
jest.unstable_mockModule("../../utils/redis.js", () => ({
  default: {
    createQueue: mockCreateQueue,
  },
}));
const { default: seatExpiredService } = await import(
  "../../services/seat-expired-service.js"
);

beforeEach(async () => {
  jest.clearAllMocks();
  mockCreateQueue.mockReset();
  mockCreateQueue.mockImplementation(() => ({
    add: mockQueueAdd,
  }));

  await db("parties").truncate();
});

afterAll(async () => {
  await db.destroy();
});

describe("seat expired service", () => {
  it("should delete parties if seats are expired", async () => {
    // arrange: create parties with expired seats
    const expireDate = new Date(Date.now() - 24 * 1000 * 60 * 60).toISOString();
    const parties = await seedParties(5, 5, {
      status: STATUS_SEATED,
      seat_expiration: expireDate,
    });
    const partyIDs = parties.map((party) => party.party_id);

    // act: call the service
    await seatExpiredService.expireSeats();

    // assert: the parties with expired seats are removed from the database
    const updatedParties = await getPartiesByIDs(partyIDs);
    expect(updatedParties).toHaveLength(0);

    // the dequeue queue is called
    expect(mockCreateQueue).toHaveBeenCalledWith(DEQUEUE_QUEUE);
  });

  it("should not delete parties if their seats are not expired", async () => {
    // arrange: create parties with time remaining before seats expire
    const expireDate = new Date(Date.now() + 24 * 1000 * 60 * 60).toISOString();
    const parties = await seedParties(5, 5, {
      status: STATUS_SEATED,
      seat_expiration: expireDate,
    });
    const partyIDs = parties.map((party) => party.party_id);

    // act: call the service
    await seatExpiredService.expireSeats();

    // assert: the parties have not been removed from the database
    const updatedParties = await getPartiesByIDs(partyIDs);
    expect(updatedParties).toHaveLength(parties.length);
    // dequeue is not called
    expect(mockCreateQueue).not.toHaveBeenCalled();
  });
});
