import "./config/load-config.js";

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
export default {
  client: "pg",
  connection: {
    // if left unspecified, the other details will be used
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false,
    migrations: {
      tableName: "knex_migrations",
    },
  },
};
