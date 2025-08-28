# Waitlist

A waitlist application written using ExpressJS.

This application:
- Uses server side rendering for providing dynamic content based on users' queued status
- Uses workers to handle serializing multiple, simultaneous incoming requests and updates to the waitlist
- Server-sent events combined with a message queue to handle updating clients without polling


For architectural decisions: see the `architecture-decisions.md` file.

For a brief architecture overview: see the `architecture-overview.md` file.

For setup, requirements, and running the application, see the below sections.


## Initial Setup / Requirements

The following section details the initial setup and requirement instructions.
For instructions on running the application, see the next section.

Before you start the application, you will need to create an env file. See the
[section on env files](#env-files) for details.

You will also need to have [Docker](https://www.docker.com/) installed and
running


## Running

**NOTE**

The production compose file requires serving over HTTPS, and so instructions
are not detailed on the run process.

Without HTTPS enabled, the cookie sessions necessary for saving the client's
state are non-functional (in production).


[Development setup]

The first two steps are required because the the development environment uses a
mount (allowing changes on the host to be reflected in the container), and the
`COPY` step of the Dockerfile will override anything built within the
container.

1. Set your environment:

```bash
export NODE_ENV=dev
```

2. Install node modules:

```bash
npm ci
```

3. Run your build command to minify and transpile the frontend code:

```bash
npm run build
```

4. Run the following npm script:

```bash
npm run docker:dev:up
```

5. Visit the site (default URL will be `http://localhost:3000`)


## Testing

The following section details how to run your tests.

**WARNING:**

For end-to-end tests, there is a port-mapping tied to 5432 and cypress is ran
on the host. For this reason, you should make sure you do not have postgresql
running locally. This will make sure that when cypress uses tasks to setup a
proper environment per tests, it affects the container database and not the
local one.

1. Install node modules (allowing you to use jest and cypress):

```bash
npm ci
```

2. Run the following npm script:

```bash
npm run docker:test:up
```

3. Run your integration tests.

If running integration tests:

```bash
npm run test:integration
```

4. Run your end-to-end tests:

via the GUI

```bash
npm run cy:open
```

OR via the CLI

```bash
npm run cy:test
```

**NOTE**

The docker container compose starts redis, but does not start any workers.

The reasoning for this is that in order to run end-to-end tests in a reasonable
time period, cypress tasks needs control over the scheduling of when certain
worker tasks would run.


## Env Files

The following is the .env file structure.
There should be three .env files as follows:

- **.env.development**: this is used whenever the `NODE_ENV` is set to `dev`
- **.env.test**: this is used whenever the `NODE_ENV` is set to `test`
- **.env.production**: this is used whenever the `NODE_ENV` is set to `prod`
- **.env**: this is used solely by the `production` compose file to provide database environmental variables

The application environmental variable file should have the following variables:

- **DB_HOST**: the host to use for the database (ex: `localhost`)
- **DB_PORT**: the port to use for the database (ex: `5432`)
- **DB_USER**: the user to login to the database as (ex: `user`)
- **DB_PASSWORD**: the password to login to the database with (ex: `user password`). This should be a secure, hard-to-guess value.
- **DB_NAME**: the name of the database to connect to (ex: `waitlist`)
- **CHECKIN_EXPIRY_SECONDS**: sets how long (in seconds) the client has to check-in from the waitlist once they've been dequeued (ex: `60`)
- **MAX_SEATS**: sets how many people can be seated at once from the waitlist (ex: `10`)
- **SERVICE_TIME_SECONDS**: sets that a party that has been seated has, per-person, before they are removed from the database. For example, if set to `3`, then a party size of 5 would have 15 seconds from the time that they're seated to the time that they're removed from the database (and unseated)
- **COOKIE_MAX_AGE_SECONDS**: the max age of a cookie in seconds (ex: `86400`)
- **SESSION_KEY**: the session key used to sign cookie sessions (ex: `secret-session-key`). This should be a secure, hard-to-guess value.
- **REDIS_PORT**: the port the redis service is set to run on (ex: `6379`)

If you are running the `production` compose file, the `.env` file will need the following variables:

- **POSTGRES_USER**: set this equal to the `DB_USER` environmental's value
- **POSTGRES_PASSWORD**: set this equal to the `DB_PASSWORD` environmental's value
- **POSTGRES_DB**: set this equal to the `DB_NAME` environmental's value

Below is an example file:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres_test
DB_PASSWORD=postgres_test
DB_NAME=waitlist_test

CHECKIN_EXPIRY_SECONDS=30
MAX_SEATS=10
SERVICE_TIME_SECONDS=3

COOKIE_MAX_AGE_SECONDS=86400
SESSION_KEY=abc123
REDIS_PORT=6379
```

**You should ensure that your env file lines up with the relevant docker
compose file you wish to deploy with.**

