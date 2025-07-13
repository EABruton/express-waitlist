import knex from "knex";
import config from "../config/db.js";

const db = knex(config);

export default db;
