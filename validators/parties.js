import { body } from "express-validator";
import { MAX_PARY_NAME_LENGTH, MAX_SEATS } from "../config/waitlist.js";

const createPartyValidator = [
  body("name")
    .isString()
    .withMessage("Name must be a string")
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ min: 1, max: MAX_PARY_NAME_LENGTH })
    .withMessage(
      `Name must be between 1 and ${MAX_PARY_NAME_LENGTH} characters`,
    )
    .escape(),
  body("size")
    .isInt({ min: 1, max: MAX_SEATS })
    .withMessage("Size must be a positive integer")
    .toInt()
    .withMessage("Size must be a positive integer")
    .escape(),
];

export default {
  createPartyValidator,
};
