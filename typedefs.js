/**
 * @file Defines custom JSDoc types for the application.
 */

/**
 * Represents a party in the waitlist system.
 * @typedef {object} Party
 * @property {string} id - the party's primary key
 * @property {string} party_id - a short, unique party ID that is sent client-side
 * @property {number} size - the amount of seats required by the party
 * @property {string} queued_at - when the party was queued
 * @property {Date | undefined} seat_expiration - when the party's seat expired (end of their service time)
 * @property {Date | undefined} checkin_expiration - when the party's checkin time expired (indicating they did not hit the "Check in" button)
 * @property {PartyStatus} status - the status of the party in the checkin process
 *
 * @exports Party
 */

/**
 * @typedef {import('express').Request} ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 * @typedef {import('express').NextFunction} ExpressNext
 *
 * @exports ExpressRequest
 * @exports ExpressResponse
 * @exports ExpressNext
 */
