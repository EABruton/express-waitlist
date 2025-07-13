/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  verbose: true,
  testMatch: ["**/tests/**/*.test.js"],
  moduleFileExtensions: ["js", "json"],
  transform: {
    "^.+\\.js$": "babel-jest", // Apply babel-jest to your JS files
  },
  collectCoverage: true,
};

export default config;
