const PARTY_ID_LENGTH = 10;

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return Promise.all([
    knex.schema.createTable("parties", function (table) {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.string("party_id", PARTY_ID_LENGTH).unique().notNullable();
      table.integer("size").notNullable();
      // we could probably use 'created_at' in place of this, but I prefer this for clarity
      table
        .timestamp("queued_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      // these two values could probably be computed based on an 'updated_at' field,
      // combined with status, but I think it helps to keep them distinct and explicit
      table.timestamp("seat_expiration", { useTz: true }).nullable();
      table.timestamp("checkin_expiration", { useTz: true }).nullable();
      table
        .enu("status", ["queued", "checking-in", "seated"])
        .notNullable()
        .defaultTo("queued");
      table.string("name", 30).notNullable();
    }),
  ]);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return Promise.all([knex.schema.dropTable("parties")]);
}
