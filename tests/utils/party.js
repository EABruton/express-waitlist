/**
 * @file This file provides test utilities for interacting with the database that are
 * independent of the functions provided by the parties model (preventing a change in the
 * model's implementation from affecting these functions).
 */
import { nanoid } from "nanoid";
import db from "../../models/db.js";

const TABLE_NAME = "parties";

/**
 * @import { Party } from '../../typedefs.js';
 */

/**
 * Seed the database with the provided number of parties, allowing simulation of a queue.
 *
 * @param {number} numberOfParties - the number of parties to create
 * @param {number} sizePerParty - the size per party
 * @param {object} additionalProperties - additional party properties to adjust (such as status or name)
 * @returns {Promise<Party[]>} the inserted partys, sorted by party_id
 */
export async function seedParties(
  numberOfParties,
  sizePerParty,
  additionalProperties = {},
) {
  const partyData = [];
  for (let i = 0; i < numberOfParties; i++) {
    const id = nanoid(10);
    partyData.push({
      name: id,
      party_id: id,
      size: sizePerParty,
      ...additionalProperties,
    });
  }

  const inserted = await db(TABLE_NAME).insert(partyData).returning("party_id");
  // return the parties sorted by party id
  return await db(TABLE_NAME)
    .select("*")
    .whereIn("party_id", inserted)
    .orderBy("party_id");
}

/**
 * Deletes a given party by its ID.
 *
 * @param {string} partyID - the party whose ID to delete
 * @returns {Promise<void>}
 */
export async function deletePartyByID(partyID) {
  await db(TABLE_NAME).where({ party_id: partyID }).del();
}

/**
 * Gets a party by its party ID.
 *
 * @param {string} partyID - the party's party_id
 * @returns {Promise<Party>} a party with a matching party_id
 */
export async function getPartyByID(partyID) {
  return await db(TABLE_NAME).select("*").where({ party_id: partyID }).first();
}

/**
 * Gets a batch of parties by party IDs.
 *
 * @param {string[]} partyIDs - the parties whose IDs to retrieve
 * @returns {Promise<Party[]>} a group of parties whose party_id fields match
 */
export async function getPartiesByIDs(partyIDs) {
  return await db(TABLE_NAME).select("*").where("party_id", "in", partyIDs);
}

/**
 * Update a given party's properties.
 *
 * @param {string} partyID - the party's party_id
 * @param {object} properties - the properties to update (ex: status, seats, name)
 * @returns {Promise<void>}
 */
export async function updateParty(partyID, properties) {
  await db(TABLE_NAME).update(properties).where({ party_id: partyID });
}
