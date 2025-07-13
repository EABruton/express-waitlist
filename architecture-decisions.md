# Architecture Decisions

The following document details the architectural decisions made in creating this waitlist application.

For architecture overview, see `architecture-overview.md`.

### Frontend Framework

As there is no complicated state management or need for a large network of components, I chose the vanilla JS approach.
Additionally, since Next / Nest were not allowed, it was less boilerplate as opposed to setting up React.

### Database

Due to my greater familiarity with it, I chose a Postgresql database.
The need for reporting correct positions of users in the waitlist (using transactions) and emphasis on correct timing / integrity pointed towards an ACID-compliant database.

### Backend

I opted for Node.js / Express.js from a greater familliarity standpoint here.

### Server-Sent Events / Pub-Sub

I decided to use server-sent events to notify clients of updates to their position in the queue.
While this comes with a trade-off of tying up a server connection, it avoid the timing pitfalls of polling and helps avoid unneccessary database queries.

I tied this in to a pub-sub system with Redis to allow all clients to be notified at the same time that updates happen, which both avoids multiple clients separately polling the database, but also keeps things moving faster than polling. I felt that this speed was also an important factor in waitlist system.

### Session Cookies

I used session cookies to store state on the user to avoid repeated database lookups when possible.
The trade-off of this was the need to keep track of those cookies (both of their presence and when to clean them up).

### Workers / Queues

I setup workers for the tasks:

- dequeueing users from the waitlist
- expiring users who did not check-in in time
- removing users whose seats had expired from the database

While this did add additional complexity, I believed it was necessary to avoid timing issues, and helped keep a clean separation of tasks.

Transactions could have been used instead, and could have aided in avoiding an external dependency such as Redis. They would have helped avoid timing issues if multiple clients were trying to dequeue users, expire users' checkins, or expire seats at the same time.
However, they also would have required unneccessary database queries (for example, if two clients are trying to dequeue at the same time, the first query could dequeue them both, but then the second query would just hit the database and do nothing).

With workers and task queues, I could make sure that things were handled in the specific order that they occurred (without much of the complexity of concurrency).
I could also ensure that only one database hit was happening for a specific task, and was able to avoid expensive transactions.

There are, still, likely database queries happening that might not be necessary.
For example, if two users queue up in succession, the worker runs back-to-back. If both users are in the database at the same time, or if it's not time for the queue to shift yet, there's not need to attempt a dequeue.
But I believe this trade-off was better than the alternative of relying on transactions.

Additionally, with workers, since I could schedule them, I could handle checkin-expiration and seat-expiration timing precicesely by scheduling the worker responsible for those tasks based on when those events were scheduled to occur. This helped avoid unnecessary runs.

### Environmental Variables

While the requirements mentioned that the maximum number of seats and service time calculation were hard-coded, I did briefly consider making them a model in the database. In a production environment, however, I still would probably opt for the environmental variable route, as these values don't seem likely to change often.

### Checkin Expiration

Although not in the requirements, I added a checkin expiration feature, as I believe this would be an important part of the real application.

This feature gives users who have been dequeued a number of seconds (defined in an environmental variable) to actually check-in once they have been scheduled to be dequeued.
This prevents clients from leaving the application or webpage open, then forgetting that they were in queue and blocking the queue from other clients who are on the waitlist.

The downside of this is that because we don't know when, in that timing phase, that a user will click the check-in button, it makes the wait time of clients in the queue very unpredictable. Some users might click the button as soon as it appears. Others might wait the full 60 seconds.
As a result, it wasn't feasible to reliably offer users a wait-time calculation - only their position in queue.

It might have been possible to provide an "estimated wait time" to clients based on the number of seated users ahead of the client in queue, but this seemed like it would be a lot of added complexity (especially considering differing seat expiration times and party sizes) for something that wasn't reliable.

### Testing

Due to a mixture of time-constraints and desire to avoid redundancy, I focused my efforts on integration and end-to-end testing rather than unit testing.

While I would ideally like to add more unit tests to handle every branching scenario, I don't believe there would be a lot of value gained for the time input, especially considering the limited complexity of most of the functions in the application.
