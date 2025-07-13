import {
  STATUS_CHECKING_IN,
  STATUS_QUEUED,
  STATUS_SEATED,
} from "../constants/party-statuses.js";
import {
  COULD_NOT_CALCULATE_PARTY_QUEUE_POSITIONS,
  COULD_NOT_DELETE_CHECKIN_EXPIRED_PARTIES,
  COULD_NOT_GET_MAX_AVAILABLE_SEATS,
  COULD_NOT_GET_PARTIES_TO_DEQUEUE,
  COULD_NOT_REMOVE_EXPIRED_SEATS,
  PARTY_COULD_NOT_BE_CREATED,
  PARTY_COULD_NOT_BE_DELETED,
  PARTY_COULD_NOT_CHECK_IN,
  PARTY_COULD_NOT_SET_SEATED,
  PARTY_NOT_FOUND,
} from "../constants/errors.js";
import dbUtils from "./db-utils.js";
import db from "./db.js";
import { nanoid } from "nanoid";
import {
  CHECKIN_EXPIRY_SECONDS,
  MAX_SEATS,
  SERVICE_TIME_SECONDS,
} from "../config/waitlist.js";

/**
 * @import { Party } from '../typedefs.js';
 */

const TABLE_NAME = "parties";

/**
 * Gets a party from the database who has a matching party ID
 *
 * @param {string} id - the party ID of the party to retrieve
 * @returns {Promise<[string|null, Party|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is the party information, or `null` if an error occurred
 * @description
 * This function retrieves a party from the database based on the provided party ID.
 *
 * It uses a SELECT query to find the party with the matching ID in the 'parties' table.
 * If the party is found, it returns the party information; otherwise, it returns
 * an error code indicating that the party could not be found.
 */
async function getPartyByID(id) {
  const partySelectQuery = db(TABLE_NAME)
    .select("*")
    .where({ party_id: id })
    .first();

  const [error, result] = await dbUtils.safeQuery(
    partySelectQuery,
    "Select party by ID",
  );

  if (error || !result) return [PARTY_NOT_FOUND, null];
  return [null, result];
}

/**
 * Creates a party in the database.
 *
 * @param {string} name - the name of the party
 * @param {number} size - the size of the party
 * @returns {Promise<[string|null, { partyID: string, positionInQueue: number }]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is an object containing the party's ID and position in queue, or `null` if an error occurred
 * @description
 * This function creates a new party in the database with the given name and size.
 * It generates a unique party ID using `nanoid` and inserts the party into the 'parties'
 * table. The function also calculates the position of the party in the queue based on
 * the order they were queued. It uses a transaction to ensure that the party is inserted
 * and the position is calculated atomically.
 */
async function createParty(name, size) {
  const partyID = nanoid(10);

  // here, we insert the party into the database and then get their position in the queue
  // we do this as a transaction so that we can report back an accurate queue position
  const transaction = db.transaction(async (trx) => {
    await trx(TABLE_NAME).insert({
      name,
      size,
      party_id: partyID,
      // this is the default, but is included here for clarity
      status: STATUS_QUEUED,
    });

    // get the position into the queue that the party is inserted
    const [{ position }] = await trx
      .select("ByQueuedAt.row_num as position")
      // subquery for ordering users by when they were queued
      .from(function () {
        this.select(
          "party_id",
          trx.raw(
            "ROW_NUMBER() OVER (ORDER BY queued_at ASC, party_id) as row_num",
          ),
        )
          .where({ status: STATUS_QUEUED })
          .from(TABLE_NAME)
          .as("ByQueuedAt");
      })
      .where({ party_id: partyID });

    return { positionInQueue: position, partyID };
  });

  const [error, result] = await dbUtils.safeQuery(
    transaction,
    "Create new party",
  );
  if (error) return [PARTY_COULD_NOT_BE_CREATED, null];

  return [
    null,
    { ...result, positionInQueue: parseInt(result.positionInQueue) },
  ];
}

/**
 * Deletes a party that has the matching ID.
 *
 * @param {string} partyID - the party ID for the given party
 * @returns {Promise<[string|null, null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is null
 * @description
 * This function deletes a party from the database based on its ID.
 * It uses a DELETE query to remove the party from the 'parties' table.
 */
async function deletePartyByID(partyID) {
  const deleteQuery = db(TABLE_NAME).where({ party_id: partyID }).del();
  const [error, result] = await dbUtils.safeQuery(
    deleteQuery,
    "Delete party by ID",
  );

  if (error) return [PARTY_COULD_NOT_BE_DELETED, null];
  if (!result) return [PARTY_NOT_FOUND, null];
  return [null, null];
}

/**
 * Gets the available seat count.
 *
 * Counts users who are seated (with unexpired seats) and users who
 * are currently checking in, subtracting their combined seat count
 * from the total available seats.
 *
 * @returns {Promise<[string|null, number|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is the number of available seats or `null` if an error occurred
 * @description
 * This function calculates the number of available seats by summing the sizes of parties
 * that are currently seated and those that are checking in. It subtracts this sum from the
 * maximum number of seats to determine how many seats are still available.
 *
 * The returned value is the number of available seats, which can be used to determine
 * whether more parties can be seated or if the queue needs to be managed.
 */
async function getAvailableSeatCount() {
  // take the SUM of the seated parties whose seats are not expired or who are being seated
  // subtract the max seat size by that sum to figure out how many seats are available
  const seatedQuery = db(TABLE_NAME)
    .sum("size")
    .where((queryBuilder) => {
      queryBuilder
        .where("seat_expiration", ">", db.fn.now())
        .andWhere({ status: STATUS_SEATED });
    })
    .orWhere({ status: STATUS_CHECKING_IN });

  const [seatCountError, [{ sum }]] = await dbUtils.safeQuery(
    seatedQuery,
    "Get seated count",
  );

  if (seatCountError) return [COULD_NOT_GET_MAX_AVAILABLE_SEATS, null];
  // in  the case of there being no one seated, sum would be null, so we fallback to 0.
  const seatedCount = sum || 0;
  const availableSeats = MAX_SEATS - seatedCount;

  return [null, availableSeats];
}

/**
 * Gets the party IDs and position in the queue.
 *
 * @returns {Promise<[string|null, {partyID: string, row: number}[]|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is an array of party IDs and row numbers, or `null` if an error occurred
 * @description
 * This function retrieves the current queue positions of parties that are in the 'queued' status.
 * It uses a window function to assign a row number to each party based on the order they
 * were queued. The results are ordered by the `queued_at` timestamp in ascending order.
 *
 * This function is typically used to display the current queue status to users, allowing them
 * to see their position in the queue and the order of other parties.
 */
async function getCurrentQueuePositions() {
  const queuePositionsQuery = db(TABLE_NAME)
    .select(
      "party_id as partyID",
      db.raw("ROW_NUMBER() OVER (ORDER BY queued_at ASC, party_id) as row"),
    )
    .where({ status: STATUS_QUEUED })
    .orderBy("queued_at", "asc");

  const [queuePositionsError, queuePositions] = await dbUtils.safeQuery(
    queuePositionsQuery,
    "Get parties' queue positions",
  );
  if (queuePositionsError)
    return [COULD_NOT_CALCULATE_PARTY_QUEUE_POSITIONS, null];

  return [null, queuePositions];
}

/**
 * Gets the party IDs of parties who can be dequeued, based on party size versus available seat count.
 *
 * @param {number} availableSeats - the unoccupied seat count
 * @returns {Promise<[string|null, string[]|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is a list of party whose IDs can be dequeued, or `null` if an error occurred
 * @description
 * This function retrieves the IDs of parties that can be dequeued based on the available seat count.
 * It uses a window function to calculate the cumulative size of parties in the queue and filters
 * those whose cumulative size is less than or equal to the available seats.
 */
async function getPartiesToDequeue(availableSeats) {
  const queuedUsersQuery = db
    .with("queued_parties", function (queryBuilder) {
      // this window function will get a cumulative party size, which can then be used
      // in the where clause to get only the queued parties who are less than or equal
      // to that size
      queryBuilder
        .select(
          "party_id",
          "size",
          // Note: for the edge case where the `queued_at` is the same, a second ordering is added
          // otherwise, you get two parties with the same `running_total`
          db.raw(
            "SUM(size) OVER (ORDER BY queued_at ASC, party_id) as running_total",
          ),
        )
        .from(TABLE_NAME)
        .where("status", STATUS_QUEUED);
    })
    .select("party_id")
    .from("queued_parties")
    .where("running_total", "<=", availableSeats);

  const [queuedUsersError, queuedUsers] = await dbUtils.safeQuery(
    queuedUsersQuery,
    "Get queued users",
  );

  if (queuedUsersError) return [COULD_NOT_GET_PARTIES_TO_DEQUEUE, null];
  const flattenedIDs = queuedUsers.map(({ party_id }) => party_id);

  return [null, flattenedIDs];
}

/**
 * Sets parties' status to 'checking-in' and sets their expiration date to
 * a predetermined point in the future.
 *
 * @param {string[]} partyIDs - a list of party IDs to set to checking in
 * @returns {Promise<[string|null, string|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is the checkin expiration time (returned from the database), or `null` if an error occurred
 * @description
 * This function updates the status of parties to 'checking-in' and sets their check-in expiration time.
 * It takes an array of party IDs and updates their status in the database.
 *
 * The check-in expiration time is calculated based on the `CHECKIN_EXPIRY_SECONDS`
 * environment variable, which determines how long the parties have to check in.
 *
 * This function is typically used to initiate the check-in process for parties that are ready
 * to be seated, allowing them to confirm their presence within a specified time frame.
 */
async function setCheckingInStatus(partyIDs) {
  const expiryTimeStr = `NOW() + INTERVAL '${CHECKIN_EXPIRY_SECONDS} SECOND'`;
  const updateStatusQuery = db(TABLE_NAME)
    .update({
      status: STATUS_CHECKING_IN,
      checkin_expiration: db.raw(expiryTimeStr),
    })
    .whereIn("party_id", partyIDs)
    // we use this checkin expiration time to schedule our job for cleaning up
    // users who do not checkin by this time
    .returning("checkin_expiration");

  const [updateStatusError, checkinExpirations] = await dbUtils.safeQuery(
    updateStatusQuery,
    "Update to checking-in status",
  );
  if (updateStatusError) return [PARTY_COULD_NOT_CHECK_IN, null];
  if (checkinExpirations.length < 1) return [null, ""];

  const { checkin_expiration: checkinExpiration } = checkinExpirations[0];
  return [null, checkinExpiration];
}

/**
 * Deletes users who did not checkin within the expiration time.
 *
 * @returns {Promise<[string|null, string[]|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is a list of party IDs whose statuses were updated or `null` if an error occurred
 * @description
 * This function deletes parties that are currently in the checking-in status
 * and whose check-in expiration time has passed.
 *
 * This function is usually scheduled by other workers at the time of dequeue so that
 * checking-in parties are cleaned up in a timely manner.
 */
async function deleteCheckingInExpiredParties() {
  const checkingInExpiredQuery = db(TABLE_NAME)
    .where({ status: STATUS_CHECKING_IN })
    .andWhere("checkin_expiration", "<", db.fn.now())
    .del()
    .returning("party_id");
  const [checkingInUpdateErrors, checkingInExpiredPartyIDs] =
    await dbUtils.safeQuery(
      checkingInExpiredQuery,
      "Expire checking in parties",
    );

  if (checkingInUpdateErrors)
    return [COULD_NOT_DELETE_CHECKIN_EXPIRED_PARTIES, null];

  const deletedIDs = checkingInExpiredPartyIDs.map(({ party_id }) => party_id);
  return [null, deletedIDs];
}

/**
 * Updates a given party's status to seated.
 *
 * @param {string} partyID - the ID of the party to update the seated status for
 * @param {number} partySize - the size of the party (used to multiply the service time)
 * @returns {Promise<[string|null, string|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is the seat's expiration time or `null` if unsuccessful
 * @description
 * This function updates the status of a party to 'seated' and sets the seat expiration time
 * to a predetermined time in the future. It only updates parties that are currently
 * in the 'checking-in' status.
 *
 * The seat expiration time is calculated based on the `SERVICE_TIME_SECONDS` environment variable,
 * multiplied by the party size.
 *
 * This function is typically used to mark a party as seated after they have successfully checked in,
 * allowing them to occupy a table for a specified period of time.
 */
async function updateSeatedStatus(partyID, partySize) {
  const expiryTimeStr = `NOW() + INTERVAL '${SERVICE_TIME_SECONDS * partySize} SECOND'`;
  const setSeatedQuery = db(TABLE_NAME)
    .update({ status: STATUS_SEATED, seat_expiration: db.raw(expiryTimeStr) })
    // we add the status of checking in as an extra measure against someone
    // calling the endpoint prior to or after the time they're eligible to checkin
    .where({ party_id: partyID, status: STATUS_CHECKING_IN })
    .returning("seat_expiration");

  const [setSeatedErrors, setSeatedResult] = await dbUtils.safeQuery(
    setSeatedQuery,
    "Update party to seated status",
  );

  if (setSeatedErrors) return [PARTY_COULD_NOT_SET_SEATED, null];
  if (setSeatedResult.length < 1) return [PARTY_NOT_FOUND, null];

  return [null, setSeatedResult[0].seat_expiration];
}

/**
 * Removes expired seats from the database.
 *
 * @returns {Promise<[string|null, string[]|null]>}
 * a tuple where
 *  - the first value is an error message code (if any), or `null` if successful
 *  - the second value is a list of party IDs whose seats were removed, or `null` if an error occurred
 * @description
 * This function removes parties that are currently seated and whose seat expiration time has passed.
 * It deletes these parties from the database and returns their IDs.
 *
 * This is typically used to clean up parties that have exceeded their allotted seating time.
 */
async function removeExpiredSeats() {
  const expiredSeatsQuery = db(TABLE_NAME)
    // select parties that are seated and whose seat expiration time has passed
    .where({ status: STATUS_SEATED })
    .andWhere("seat_expiration", "<", db.fn.now())
    .del()
    .returning("party_id");
  const [expiredSeatsError, expiredSeats] = await dbUtils.safeQuery(
    expiredSeatsQuery,
    "Remove expired seats",
  );

  if (expiredSeatsError) return [COULD_NOT_REMOVE_EXPIRED_SEATS, null];
  return [null, expiredSeats.map(({ party_id }) => party_id)];
}

export default {
  getPartyByID,
  createParty,
  getAvailableSeatCount,
  getPartiesToDequeue,
  setCheckingInStatus,
  deleteCheckingInExpiredParties,
  updateSeatedStatus,
  deletePartyByID,
  getCurrentQueuePositions,
  removeExpiredSeats,
};
