import { jest } from "@jest/globals";
import request from "supertest";
import {
  DEQUEUE_QUEUE,
  SEAT_EXPIRED_QUEUE,
} from "../../constants/message-queues.js";
import db from "../../models/db.js";

const PAGE_NEW_PARTY = "/party/new";
const PAGE_VIEW_PARTY_STATUS = "/party";
const ENDPOINT_PARTY_CHECKIN = "/party/check-in";
const ENDPOINT_PARTY_LEAVE_QUEUE = "/party";
const ENDPOINT_PARTY_EVENTS = "/party/events";
const ENDPOINT_NEW_PARTY = "/party";

const mockSetupStream = jest.fn();
const mockEventStreamModule = {
  default: {
    setupStream: mockSetupStream,
  },
};
jest.unstable_mockModule(
  "../../services/event-stream-service.js",
  () => mockEventStreamModule,
);

const mockScheduleJobAt = jest.fn();
const mockScheduleJobModule = {
  default: mockScheduleJobAt,
};
jest.unstable_mockModule(
  "../../utils/schedule-job.js",
  () => mockScheduleJobModule,
);

const mockCreateQueue = jest.fn();
const mockRedisModule = {
  default: {
    createQueue: mockCreateQueue,
  },
};
jest.unstable_mockModule("../../utils/redis.js", () => mockRedisModule);

const { default: app } = await import("../../app.js");

import parties from "../../models/parties.js";
import { deletePartyByID, seedParties, updateParty } from "../utils/party.js";
import {
  ERROR_INVALID_REQUEST,
  ERROR_UNAUTHORIZED,
  getClientErrorMessage,
  PARTY_NOT_FOUND,
} from "../../constants/errors.js";
import { STATUS_CHECKING_IN } from "../../constants/party-statuses.js";

beforeEach(async () => {
  jest.clearAllMocks();
  mockCreateQueue.mockReset();
  mockCreateQueue.mockImplementation(() => ({
    add: jest.fn(),
  }));

  await db("parties").truncate();
});

afterAll(async () => {
  await db.destroy();
});

describe("party check-in", () => {
  const validData = { size: "2", name: "party name" };
  const invalidData = { size: "12", name: "party name" };

  it("should return 400 when data is invalid", async () => {
    // arrange: invalid data
    const data = { size: 11, name: "a party" };
    // act: post invalid data
    const response = await request(app).post(ENDPOINT_NEW_PARTY).send(data);

    // assert: bad request response
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ERROR_INVALID_REQUEST });
  });

  it("should return 400 when validation validation fails on join", async () => {
    // act: send invalid data
    const response = await request(app)
      .post(ENDPOINT_NEW_PARTY)
      .send(invalidData);

    // assert: bad request response
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ERROR_INVALID_REQUEST });
  });

  it("should return 204 when party is successfully created", async () => {
    // arrange: verify initial state
    const createPartySpy = jest.spyOn(parties, "createParty");
    expect(mockCreateQueue).toHaveBeenCalledTimes(0);

    // act: make the request with valid data
    const response = await request(app)
      .post(ENDPOINT_NEW_PARTY)
      .send(validData);

    // assert: status code is correct and the expected side-effect occurs
    expect(response.status).toBe(201);
    // side effect should be the queue creation
    expect(createPartySpy).toHaveBeenCalledWith(validData.name, validData.size);
    expect(mockCreateQueue).toHaveBeenCalledWith(DEQUEUE_QUEUE);
    expect(mockCreateQueue).toHaveBeenCalledTimes(1);
  });

  it("should render new party page when session is empty", async () => {
    // arrange: spy on the model
    const getPartyByIDSpy = jest.spyOn(parties, "getPartyByID");
    // act: get the page
    const response = await request(app).get(PAGE_NEW_PARTY);

    // assert: the DB was not hit and the correct page is rendered
    expect(getPartyByIDSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/join the waitlist/i); // page title
  });

  it("should redirect to the status page if client is in a party", async () => {
    const agent = request.agent(app); // stores session cookies between requests
    // arrange: check-in to get session cookie
    const checkinResponse = await agent
      .post(ENDPOINT_NEW_PARTY)
      .send(validData);
    expect(checkinResponse.status).toBe(201);

    // act: navigate to new party page with the session set
    const response = await agent.get(PAGE_NEW_PARTY);

    // assert: we've been redirected to status
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(PAGE_VIEW_PARTY_STATUS);
  });

  it("should clear session and show create party page if session is stale", async () => {
    const agent = request.agent(app); // stores session cookies between requests
    // arrange: check-in to set a session cookie
    const checkinResponse = await agent
      .post(ENDPOINT_NEW_PARTY)
      .send(validData);
    expect(checkinResponse.status).toBe(201);

    // delete the party from the database
    await deletePartyByID(checkinResponse.body.partyID);

    // act: visit the new party page
    const response = await agent.get(PAGE_NEW_PARTY);

    // assert: we were not redirected
    expect(response.status).toBe(200);
  });
});

describe("party status", () => {
  beforeEach(() => {
    mockScheduleJobAt.mockReset();
    mockSetupStream.mockReset();
  });

  /**
   * Helper function to get a session for a request agent that includes
   *
   * @param {TestAgent} agent - the supertest request agent
   * @returns {Promise<{ partyID: string, positionInQueue: string }>}
   */
  async function getPartySession(agent) {
    const response = await agent
      .post(ENDPOINT_NEW_PARTY)
      .send({ name: "test", size: 2 });
    return response.body;
  }

  it("should redirect to the create party page if session is invalid", async () => {
    // act: visit the status page
    const response = await request(app).get(PAGE_VIEW_PARTY_STATUS);
    // assert: we were redirected
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(PAGE_NEW_PARTY);
  });

  it("should render the queue to client if queued", async () => {
    // arrange: fill the database with a queue of parties
    await seedParties(10, 5);

    // get a session
    const agent = request.agent(app);
    const { partyID } = await getPartySession(agent);

    // act: visit the status page
    const response = await agent.get(PAGE_VIEW_PARTY_STATUS);

    // assert: status page is returned
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/check your waitlist status/i);
    expect(response.text).toMatch(/leave queue/i);
    // server-side variables are populated
    expect(response.text).toMatch(partyID);
    expect(response.text).toMatch(/your position in queue/i);
  });

  it("should return 401 when unauthorized client tries to access event stream", async () => {
    // act: attempt to access the event stream without a partyID in the session
    const response = await request(app).get(ENDPOINT_PARTY_EVENTS);

    // assert: we receive a 401 error
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: getClientErrorMessage(PARTY_NOT_FOUND),
    });
  });

  it("should return 404 when client tries to delete a non-existent party", async () => {
    // arrange: get a session
    const agent = request.agent(app);
    const { partyID } = await getPartySession(agent);
    // delete returned party from the database
    await deletePartyByID(partyID);

    // act: attempt to access the event stream
    const response = await agent.get(ENDPOINT_PARTY_EVENTS);

    // assert: we were given a 404 code and passed a message
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: getClientErrorMessage(PARTY_NOT_FOUND),
    });
  });

  it("should setup an event stream if party exists", async () => {
    // arrange: get a session, mock event stream
    mockSetupStream.mockImplementationOnce((_party, res) => {
      res.end();
    });

    const agent = request.agent(app);
    await getPartySession(agent);

    // act: access the event stream
    const response = await agent.get(ENDPOINT_PARTY_EVENTS);

    // assert: event stream is setup
    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty(
      "content-type",
      "text/event-stream",
    );
  });

  it("should return 401 when an unauthorized client attempts to check in", async () => {
    // act: send request to update without a party ID
    const response = await request(app).patch(ENDPOINT_PARTY_CHECKIN);

    // assert: we're given a 401 status code
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: ERROR_UNAUTHORIZED });
  });

  it("should return 400 and error message when a party fails to check in", async () => {
    // arrange: get a session
    const agent = request.agent(app);
    const { partyID } = await getPartySession(agent);

    await deletePartyByID(partyID);

    // act: attempt to update the party status
    const response = await agent.patch(ENDPOINT_PARTY_CHECKIN);

    // assert: a bad request with an error message is returned
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: getClientErrorMessage(PARTY_NOT_FOUND),
    });
  });

  it("should return a 200 response and schedule seat cleanup when a party is seateed", async () => {
    // arrange: setup session
    const agent = request.agent(app);
    const { partyID } = await getPartySession(agent);
    // setup mocks
    mockScheduleJobAt.mockImplementationOnce(async () =>
      Promise.resolve(undefined),
    );

    // set the party to checking in
    await updateParty(partyID, { status: STATUS_CHECKING_IN });

    // act: call to update the party status
    const response = await agent.patch(ENDPOINT_PARTY_CHECKIN);

    // assert: we receive a success code
    expect(response.status).toBe(200);
    // the queue was triggered and scheduled with the returned expiration date
    expect(mockCreateQueue).toHaveBeenCalledWith(SEAT_EXPIRED_QUEUE);
    expect(mockScheduleJobAt).toHaveBeenCalled();
  });

  it("should return 400 code and an error message if party cannot successfully be deleted", async () => {
    // arrange: setup session
    const agent = request.agent(app);
    const { partyID } = await getPartySession(agent);

    // delete the party before calling the endpoint
    await deletePartyByID(partyID);

    // act: call the delete party endpoint
    const response = await agent.delete(ENDPOINT_PARTY_LEAVE_QUEUE);

    // assert: we receive an error code and message
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: getClientErrorMessage(PARTY_NOT_FOUND),
    });
  });

  it("should send a 204 code and schedule a dequeue when a party is deleted", async () => {
    // arrange: setup session and mocks
    const agent = request.agent(app);
    await getPartySession(agent);

    // act: call the delete party endpoint
    const response = await agent.delete(ENDPOINT_PARTY_LEAVE_QUEUE);

    // assert: we receive an error code and message
    expect(response.status).toBe(204);
    expect(mockCreateQueue).toHaveBeenCalledWith(DEQUEUE_QUEUE);
  });
});
