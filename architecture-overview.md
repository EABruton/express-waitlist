# Architecture Overview

The following is a brief overview of the application chain of logic:

## Worker Details

There are three workers with distinct responsibilities used in the application:

- the dequeue worker to handle dequeueing users
- the checkin-expired worker to handle removing users who have not checked-in while they were eligible to
- the seat-expired worker to remove users who have been seated from the database after an allotted amount of time

Below is the logic flow for each worker.

[dequeue worker]

1. Queries the database for queued parties and the seated count (derived from the seated and currently checking-in party sizes)
2. Checks the parties at the front of the queue for if their size can fit within the available seat count
3. For those parties that can fit, updates their status to "checking-in" in the database and sets their "checkin_expiration" in the database
4. Broadcasts the dequeued party IDs (allowing clients eligible for dequeue to see the check-in button)
5. Broadcasts the current queue positions (allowing clients to update their queue positions)
6. Schedules a "checkin-expired" worker job for the time when the checkins should expire (allowing cleanup of users who do not check in)

[checkin-expired worker]

1. Checks the database for checkin-expired parties
2. Removes found parties from the database
3. Broadcasts the party IDs that were removed (allowing clients to know if their check-in time has expired)
4. Schedules a dequeue job, allowing the queue to be shifted up

[seat-expired worker]

1. Checks the database for seated parties (in order of seat expiration)
2. Removes parties whose seats are expired from the database
3. Schedules a dequeue job, allowing the queue to be shifted up

## Client-server Interaction Details

[Client hits create party]

1. If the party does not exist, set them to queued, schedule a dequeue job, and save their party ID and position in queue to the session

- Note: we don't immediately set them to checking-in, as this could cause
issues with multiple parties hitting the check-in button at the same time

2. Direct the party to the party status page (where they can view their queue)
3. Connect to redis channels to listen to various workers' message (see the above worker sections)
4. Connect the client to the server-sent events, allowing forwarding of message from the redis channels to the clients (if relevant to that client)
5. Based on what type of redis message is received:

- dequeue party (partyIDs include the client's partyID): send a SSE message that the user can check-in
- dequeue party (partyIDs do not include the client's partyID): inform the user of the total number of remaining queued parties and their place in it
- check-in expired (partyIDs include the client's partyID): send the user a notice that the checkin period expired and offer them a link back to the create a new party page

[Client hits the "Check in" button]

1. Server checks that the user's partyID is still in the database and that it's not expired
2. If the party is not found, send them a message that their check-in expired, otherwise, proceeds to step 3
3. Update the client's party's status to seated
4. Determine the seat expiration time based on party count and schedule the seat-expired worker for that time
