/**
 * @file This file acts as a source of shared constants between the server and
 * client (for ease of maintenance).
 *
 * Note that due to issues with import resolutions when building via Docker,
 * this folder is symlinked from the client's src folder to the server's base directory
 * folder.
 */
const CAN_DEQUEUE = "can-dequeue";
const QUEUE_POSITION_UPDATE = "queue-position-update";
const UNQUEUED_CLIENT = "unqueued-client";
const CHECKIN_WINDOW_EXPIRED = "checkin-window-expired";

export default {
  CAN_DEQUEUE,
  QUEUE_POSITION_UPDATE,
  UNQUEUED_CLIENT,
  CHECKIN_WINDOW_EXPIRED,
};
