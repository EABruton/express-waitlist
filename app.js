import "./config/load-config.js";
import { COOKIE_MAX_AGE_SECONDS } from "./config/cookies.js";
import { engine } from "express-handlebars";
import cleanupExpiredSeatSession from "./middleware/cleanup-expired-seat-session.js";
import cookieParser from "cookie-parser";
import cookieSession from "cookie-session";
import express from "express";
import logger from "./utils/logger.js";
import morgan from "morgan";
import partyRouter from "./routes/parties.js";
import path from "path";

/* @param {Express} app */
const app = express();

if (process.env.NODE_ENV === "production") {
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
    }),
  );
} else {
  app.use(morgan("dev"));
}

app.engine(
  "handlebars",
  engine({
    extname: ".handlebars",
    defaultLayout: "main", // This sets 'main.handlebars' as the default
    layoutsDir: path.join(process.cwd(), "views/layouts"),
    partialsDir: path.join(process.cwd(), "views/partials"),
  }),
);

app.use(express.static("public"));
app.set("view engine", "handlebars");
app.set("views", path.join(process.cwd(), "views"));
app.use(cookieParser());
app.use(
  cookieSession({
    name: "session",
    secret: process.env.SESSION_KEY,
    maxAge: 1000 * COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  }),
);
app.use(express.json());
app.use((req, _res, next) => {
  const baseURL = `${req.protocol}://${req.get("host")}`;
  req.baseURL = baseURL;
  next();
});

app.use(cleanupExpiredSeatSession);
app.use(partyRouter);

export default app;
