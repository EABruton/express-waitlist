/**
 * @file This file is in charge of configuring the logger based on environment.
 * It exports the configured logger.
 */
import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

const level = isProduction ? "info" : "debug";

const formatStyle = isProduction
  ? winston.format.json()
  : winston.format.colorize({ all: true });

const formatMessaging = ({ level, message, timestamp }) =>
  isProduction
    ? JSON.stringify({ level, message, timestamp })
    : `${timestamp} [${level}]: ${message}`;

const fileTransports = isProduction
  ? [new winston.transports.File({ filename: "logs/combined.log" })]
  : [];

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    formatStyle,
    winston.format.printf(formatMessaging),
  ),
  transports: [new winston.transports.Console(), ...fileTransports],
});

export default logger;
