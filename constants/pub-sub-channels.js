// this channel is for clients who are about to check in
export const CHANNEL_DEQUEUE = "dequeued-channel";
// this channel is for clients who did not hit the 'check in' button within the time limit
export const CHANNEL_CHECKING_IN_EXPIRED = "checking-in-expired-channel";
// this channel is for updating all clients on the current positions of the queue
export const CHANNEL_QUEUE_POSITIONS = "queue-positions-channel";
// this channel is for users who have freshly signed up, but who have not connected to the event stream yet to pull their position from
export const CACHE_QUEUED_PARTY_POSITIONS = "queued-party-positions";
