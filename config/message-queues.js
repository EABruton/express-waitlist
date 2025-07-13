import "./load-config.js";

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = process.env.REDIS_PORT
  ? parseInt(process.env.REDIS_PORT, 10)
  : 6379;

const config = {
  host: redisHost,
  port: redisPort,
};

export default config;
