/// <reference types="cypress" />

import "cypress-axe";

const PATH_NEW_PARTY_PAGE = "/party/new";
const PATH_PARTY_STATUS_PAGE = "/party";
const ENDPOINT_PARTY_CREATE = "/party";
const ENDPOINT_PARTY_CHECKIN = "/party/check-in";

// selectors
const sJoinWaitlistButton = "join-waitlist-button";
const sPartyNameInput = "party-name";
const sPartySizeInput = "party-size";
const sLeaveQueueButton = "leave-queue-button";
const sCheckinButton = "check-in-button";
const sCheckinSuccessText = "checkin-successful-text";
const sCheckinExpiredLink = "checkin-expired-link";
const sLeftQueueNotice = "leave-queue-notice";
const sQueuePositionText = "queue-position-text";
const sServerErrorNotice = "error-notice";

const getByTestID = (testID) => cy.get(`[data-testid="${testID}"]`);

beforeEach(() => {
  cy.task("resetDB");
});

describe("check-in", () => {
  it("can check in and be seated", () => {
    // arrange: initial state
    cy.visit(PATH_NEW_PARTY_PAGE);
    cy.injectAxe();
    cy.contains(/join the waitlist/i).should("be.visible");
    // verify initial accessibility
    cy.checkA11y();

    // act: fill out the check-in form
    getByTestID(sPartyNameInput).type("test party");
    getByTestID(sPartySizeInput).type(2);
    getByTestID(sJoinWaitlistButton).focus();
    // verify focus accessibility
    cy.checkA11y();
    getByTestID(sJoinWaitlistButton).click();

    // assert: ensure we're redirected after check-in
    cy.location("pathname").should("equal", PATH_PARTY_STATUS_PAGE);
    cy.injectAxe();
    cy.contains(/your waitlist status/i).should("be.visible");
    cy.contains(/position in queue/i).should("be.visible");
    getByTestID(sLeaveQueueButton).should("be.visible").and("be.enabled");
    // verify leave queue status accessibility
    cy.checkA11y();

    // trigger a dequeue (server-side)
    cy.task("dequeueUsersService");

    // verify that we see the check-in button
    getByTestID(sCheckinButton).should("be.visible").and("be.enabled");
    // verify checkin-ready status accessibility
    cy.checkA11y();

    // click the check-in button and verify that we've checked in successfully
    getByTestID(sCheckinButton).click();
    getByTestID(sCheckinSuccessText).should("be.visible");
    // verify checkin success messaging accessibility
    cy.checkA11y();

    // checkin status persists across refresh
    cy.reload();
    getByTestID(sCheckinSuccessText).should("be.visible");
  });

  it("renders an error notice if failing to check in", () => {
    // arrange: visit the page -> intercept the checkin request
    cy.visit(PATH_NEW_PARTY_PAGE);
    cy.injectAxe();
    cy.contains(/join the waitlist/i).should("be.visible");

    cy.intercept(
      ENDPOINT_PARTY_CREATE,
      { method: "POST" },
      {
        statusCode: 400,
      },
    );

    // act: fill out the form and submit
    getByTestID(sPartyNameInput).type("test party");
    getByTestID(sPartySizeInput).type(2);
    getByTestID(sJoinWaitlistButton).click();

    // assert: an error message renders
    getByTestID(sServerErrorNotice).should("be.visible");
    // verify error notice accessibility
    cy.checkA11y();
  });
});

describe("status", () => {
  function checkin() {
    cy.visit(PATH_NEW_PARTY_PAGE);
    cy.contains(/join the waitlist/i).should("be.visible");

    getByTestID(sPartyNameInput).type("test party");
    getByTestID(sPartySizeInput).type(2);
    getByTestID(sJoinWaitlistButton).click();

    cy.location("pathname").should("equal", PATH_PARTY_STATUS_PAGE);
  }

  it("will see a check-in expired notice if not checked-in in time", () => {
    // arrange: initial state
    checkin();

    // trigger a dequeue (server-side)
    cy.task("dequeueUsersService");

    // act: set the user's check-in to expired
    cy.task("expireCheckins");

    // trigger the checkin-expired task (server-side)
    cy.task("checkinExpiredService");

    // assert: verify we see the expired checkin notice
    getByTestID(sCheckinExpiredLink).should("be.visible");
    // verify checkin expireda accessibility
    cy.injectAxe();
    cy.checkA11y();

    // reloading redirects
    cy.reload();
    cy.location("pathname").should("equal", PATH_NEW_PARTY_PAGE);
  });

  it("can leave the queue", () => {
    // arrange: initial state
    checkin();

    // act: leave the queue
    getByTestID(sLeaveQueueButton).click();

    // assert: we successfully left the queue
    getByTestID(sLeftQueueNotice).should("be.visible");
    cy.injectAxe();
    cy.checkA11y();

    // NOTE: skipping the below as the time we wait is an implementation-detail
    // and cy.tick does not seem to work with this
    //
    // cy.wait(5000);
    // cy.location('pathname').should('equal', PATH_CHECKIN);
  });

  it("shows realtime queue updates to the user", () => {
    // arrange: create a queue of 5 parties
    cy.task("fillQueue", 5);

    // checkin
    checkin();

    // assert: position in queue
    getByTestID(sQueuePositionText).contains("6");

    // act:
    // dequeue a user
    cy.task("dequeueUsersService");
    // expire their checkin time
    cy.task("expireCheckins");
    // run the checkin expired service
    cy.task("checkinExpiredService");

    // assert: our queue updates
    getByTestID(sQueuePositionText).contains("5");
  });

  it("redirects to the status page when the party session is stale", () => {
    // arrange: initial state
    checkin();

    // act: clear the cookie
    cy.clearCookie("session");
    // reload the page
    cy.reload();

    cy.location("pathname").should("equal", PATH_NEW_PARTY_PAGE);
  });

  it("shows error when a request fails", () => {
    // arrange: checkin -> dequeue
    checkin();

    // intercept network request to checkin
    const expectedErrorText = "this is an error";
    cy.intercept(
      ENDPOINT_PARTY_CHECKIN,
      { method: "PATCH" },
      {
        statusCode: 400,
        body: { message: expectedErrorText },
      },
    );

    // dequeue the user
    cy.task("dequeueUsersService");

    // act: attempt to checkin
    getByTestID(sCheckinButton).click();

    // assert: an error notice shows with the server message
    getByTestID(sServerErrorNotice)
      .contains(expectedErrorText)
      .should("be.visible");
    cy.injectAxe();
    cy.checkA11y();

    // arrange: stub the network quest again with no error message
    cy.intercept(
      "/party",
      { method: "PATCH" },
      {
        statusCode: 500,
      },
    );

    // act: attempt to checkin
    getByTestID(sCheckinButton).click();

    // assert: a generic error message is displayed
    getByTestID(sServerErrorNotice).should("be.visible");
  });
});
