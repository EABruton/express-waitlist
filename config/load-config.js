import path from "path";
import { configDotenv } from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load the appropriate .env file based on NODE_ENV
let envFile;

if (["development", "dev"].includes(process.env.NODE_ENV)) {
  envFile = ".env.development";
} else if (["test"].includes(process.env.NODE_ENV)) {
  envFile = ".env.test";
} else {
  envFile = ".env.production";
}

configDotenv({
  path: path.resolve(__dirname, "..", envFile),
});
