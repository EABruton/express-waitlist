import js from "@eslint/js";
import globals from "globals";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginCypress from "eslint-plugin-cypress";
import eslintPluginJest from "eslint-plugin-jest";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    ignores: ["public/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    ignores: ["public/**"],
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
    ignores: ["public/**", "coverage/**"],
  },
  {
    rules: {
      "no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          caughtErrors: "all",
          ignoreRestSiblings: false,
          reportUsedIgnorePattern: false,
          // ignore unused if prefixed with an underscore
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // needed for allowing variables imported in a top-level css file to
      // be used in other files without explicitly importing the variables
      "css/no-invalid-properties": ["off"],
    },
    ignores: ["public/**"],
  },
  eslintPluginCypress.configs.recommended,
  {
    rules: {
      "cypress/no-unnecessary-waiting": "off",
    },
  },
  {
    files: ["**/*.spec.js", "**/*.test.js"],
    plugins: { jest: eslintPluginJest },
    languageOptions: {
      globals: eslintPluginJest.environments.globals.globals,
    },
    rules: {
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "jest/prefer-to-have-length": "warn",
      "jest/valid-expect": "error",
    },
  },
  eslintConfigPrettier,
]);
