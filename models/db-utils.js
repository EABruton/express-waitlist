import logger from "../utils/logger.js";

/**
 * Executes a Knex query and returns a [error, result] tuple.
 *
 * This helper wraps a Knex query in a try/catch block and returns a
 * consistent error-first result format.
 *
 * @template T - the type of the expected query result
 * @param {Knex.QueryBuilder} query - a Knex query to execute
 * @param {string} [context=''] - optional context for logging the query purpose
 * @returns {Promise<[string|null, T|null]>}
 * a tuple where:
 *  - the first value is an error message string (if any), or `null` if successful
 *  - the second value is the query result, or `null` if an error occurred
 */
async function safeQuery(query, context = "") {
  try {
    const result = await query;
    return [null, result];
  } catch (error) {
    logger.error(`[DB Error] ${context}:`, error);
    return [`Error performing: ${context}`, null];
  }
}

export default {
  safeQuery,
};
