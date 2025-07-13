export const MAX_SEATS = process.env.MAX_SEATS
  ? parseInt(process.env.MAX_SEATS)
  : 10;
export const SERVICE_TIME_SECONDS = process.env.SERVICE_TIME_SECONDS
  ? parseInt(process.env.SERVICE_TIME_SECONDS)
  : 15;
export const CHECKIN_EXPIRY_SECONDS = process.env.CHECKIN_EXPIRY_SECONDS
  ? parseInt(process.env.CHECKIN_EXPIRY_SECONDS)
  : 60;
export const MAX_PARY_NAME_LENGTH = process.env.MAX_PARY_NAME_LENGTH
  ? parseInt(MAX_PARY_NAME_LENGTH)
  : 30;
