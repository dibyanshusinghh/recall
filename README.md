# Recall

Book and manage meetings via **Google Calendar**, with **Gemini-powered** AI recording, transcription, and summaries synced from Google Meet, Drive, and Docs via Pub/Sub — full-text searchable via PostgreSQL.

---

## Architecture Overview

Recall is split into two capability tiers so that the core booking workflow is never held hostage by Google Workspace licensing.

### Tier 1 — Core (always works)

Everything a standard Google account can do:

| Feature | Implementation |
|---|---|
| Google OAuth 2.0 login | `googleapis` + `google-auth-library` |
| JWT-based sessions | `jsonwebtoken` HS256 (shared secret with the Notify Spring Boot service) |
| Google Calendar booking, rescheduling, cancellation | `googleapis` `events.insert / patch / delete` |
| Working-hours availability engine | Luxon + Google Calendar `freebusy` (graceful degradation if freebusy fails) |
| Slot holds (race-condition prevention) | Redis `SET NX EX` |
| Recurring meetings (RRULE) | RFC 5545 forwarded to Google; instance vs. series scope supported |
| Guest email notifications | `sendUpdates: "all"` — Google sends these natively |

### Tier 2 — Workspace / Gemini-gated (degrades gracefully if unavailable)

Everything that requires a Google Workspace account with Gemini enabled:

| Feature | Implementation |
|---|---|
| Pub/Sub push webhook receiver | Google-signed OIDC token verification + BullMQ enqueue |
| Artifact fetch worker | BullMQ Worker → Google Meet/Drive/Docs APIs |
| Recordings, transcripts, summaries | Stored in `recall.meeting_artifacts`, `recall.transcripts`, `recall.summaries` |
| Full-text search (transcripts & summaries) | PostgreSQL `tsvector` GIN indexes + `ts_rank` |

**Controlled by:** `WORKSPACE_FEATURES_ENABLED=true` in `.env`.  
When `false`, all Tier 2 routes return `{ status: "unavailable" }` (HTTP 200) — never an error — so Tier 1 clients are completely unaffected.

```
┌────────────────────────────────────────────────────────────┐
│                        Client (browser / mobile)           │
└────────────────┬───────────────────────────────────────────┘
                 │ REST / JWT
┌────────────────▼───────────────────────────────────────────┐
│                Recall API (Express)                        │
│                                                            │
│  Tier 1 (always active)        Tier 2 (Workspace-gated)   │
│  ──────────────────────        ──────────────────────────  │
│  /auth/**                      /webhooks/pubsub/**         │
│  /meetings/**                  /meetings/:id/artifacts     │
│  /users/:id/availability-rules /meetings/:id/transcript    │
│  /slots/**                     /meetings/:id/summary       │
│                                /search/**                  │
└─────┬──────────┬───────────────────────┬───────────────────┘
      │          │                       │
  PostgreSQL   Redis              Google APIs
  (shared with  (slot holds,     (Calendar, Meet,
   Notify svc)   rate limits,     Drive, Docs,
                 BullMQ queues)   Pub/Sub)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20.20 |
| Framework | Express 5 |
| Database | PostgreSQL — `recall` schema (separate from Notify's `public` schema) |
| Cache / queues | Redis + ioredis + BullMQ |
| Google APIs | `googleapis`, `google-auth-library` |
| Validation | Joi |
| Logging | Pino + pino-http (JSON in production, pretty in dev) |
| Auth | JWT HS256 (`jsonwebtoken`) |
| Token storage | AES-256-GCM encryption (`crypto`) |
| Date/time | Luxon |
| API docs | Swagger UI (`swagger-jsdoc` + `swagger-ui-express`) |
| Testing | Jest + Supertest + nock |
| Error monitoring | Sentry (`@sentry/node`, optional) |
| Migrations | `node-pg-migrate` |

---

## Prerequisites

- **Node.js 20.20+**
- **PostgreSQL** (shared instance with the Notify Spring Boot service; Recall uses its own `recall` schema)
- **Redis**
- A **Google Cloud project** with the following APIs enabled:
  - Google Calendar API
  - *(Tier 2 only)* Google Meet API, Google Drive API, Google Docs API, Cloud Pub/Sub API
- *(Tier 2 only)* A **Google Workspace** account with Gemini enabled on the OAuth-connected account

---

## Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd Recall
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_URL, Google OAuth credentials, etc.

# 3. Run database migrations
npm run db:migrate

# 4. Start Redis (if not already running)
redis-server

# 5. Start the development server
npm run dev
```

The API will be available at `http://localhost:3000`.  
Swagger UI: `http://localhost:3000/api-docs`

---

## Environment Variables

All variables are documented in `.env.example`. A summary:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` / `production` / `test` |
| `PORT` | Yes | HTTP port (default `3000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (shared with Notify) |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | HS256 signing secret (≥ 64 chars). Shared with Notify so it can verify Recall's JWTs. |
| `JWT_EXPIRES_IN` | Yes | Access token TTL (e.g. `1d`) |
| `JWT_REFRESH_EXPIRES_IN` | Yes | Refresh token TTL (e.g. `30d`) |
| `TOKEN_ENCRYPTION_KEY` | Yes | 64-char hex string (32 bytes) for AES-256-GCM token encryption |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL (e.g. `http://localhost:3000/auth/google/callback`) |
| `CORS_ORIGIN` | Yes | Allowed CORS origin for the frontend |
| `SLOT_HOLD_TTL_SECONDS` | Yes | How long a slot hold lives in Redis (default `600`) |
| `WORKSPACE_FEATURES_ENABLED` | Yes | `true` to enable Tier 2 (Pub/Sub, artifacts, search) |
| `GOOGLE_PROJECT_ID` | Tier 2 | GCP project ID |
| `PUBSUB_TOPIC_NAME` | Tier 2 | Pub/Sub topic name |
| `PUBSUB_SUBSCRIPTION_NAME` | Tier 2 | Pub/Sub push subscription name |
| `GOOGLE_PUBSUB_AUDIENCE` | Tier 2 | Full URL of the `/webhooks/pubsub/meeting-events` endpoint for OIDC verification |
| `SENTRY_DSN` | Optional | Sentry DSN for error monitoring. Omit in dev — the SDK no-ops gracefully. |

---

## What Happens if the Google Workspace Trial Expires?

**Tier 1 is completely unaffected.** Booking, rescheduling, cancellation, availability queries, and slot holds all continue working exactly as before — they use the standard Google Calendar API which is available on any Google account.

**Tier 2 stops producing new data** — the Pub/Sub push subscription will stop receiving conference events, so no new transcripts or summaries will be fetched. Existing transcripts and summaries in the database remain accessible. There are no errors surfaced to Tier 1 users; the artifact and search endpoints simply return `{ status: "unavailable" }` until Workspace is reactivated.

To re-enable Tier 2: renew the Workspace subscription, ensure Gemini is enabled on the account, and the system resumes automatically — no restarts or config changes needed.

---

## API Documentation

With the server running, visit **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)** for the full interactive Swagger UI.

### Endpoint Groups

| Group | Base Path | Auth | Description |
|---|---|---|---|
| **Auth** | `/auth` | None / Bearer | Google OAuth flow, JWT refresh, profile |
| **Availability** | `/users/:id/availability-rules` | Bearer | Get / replace working-hours rules |
| **Slots** | `/slots` | Bearer | Compute free slots; create/release Redis holds |
| **Meetings** | `/meetings` | Bearer | CRUD + reschedule + cancel (Tier 1) |
| **Artifacts** | `/meetings/:id/artifacts,transcript,summary` | Bearer | Tier 2 — recordings, transcripts, summaries |
| **Search** | `/search/transcripts`, `/search/summaries` | Bearer | Tier 2 — PostgreSQL full-text search |
| **Webhooks** | `/webhooks/pubsub/meeting-events` | Google OIDC | Tier 2 — Pub/Sub push receiver |

---

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

Test coverage areas:
- **Encryption utility** — AES-256-GCM roundtrip and tamper detection
- **JWT authenticate middleware** — valid, expired, malformed, and refresh-as-access-token cases
- **Slot hold service** — Redis NX semantics, TTL expiry, holdId validation, race conditions
- **Availability service** — rule expansion, busy-interval subtraction, timezone edge cases, graceful freebusy degradation
- **Booking transaction integrity** — Google-first ordering, compensating delete on DB failure
- **Pub/Sub webhook deduplication** — same `message_id` delivered twice
- **Reschedule/cancel status transitions** — status history writes, 400 on double-cancel
- **Recurring meeting instance vs. series** — correct Google event ID targeting by scope

---

## Sentry (optional)

Sentry is wired as a thin cross-cutting concern and is **completely optional**:

- If `SENTRY_DSN` is not set, `Sentry.init()` is a no-op and no data is sent. The app starts and runs normally.
- Non-operational (unexpected) errors are captured; expected operational errors (validation failures, 404s, auth errors) are not sent to reduce noise.
- The Sentry initialization scaffold is in `instrument.js` at the project root. Customise it (integrations, profiling, release tracking) as needed.

---

## Database Migrations

```bash
npm run db:migrate          # Apply all pending migrations
npm run db:migrate:down     # Roll back the last migration
npm run db:migrate:redo     # Roll back and re-apply the last migration
npm run db:migrate:status   # Show applied/pending migrations
```

Migrations live in `migrations/`. Migration `001` verifies that `public.users` (owned by the Notify service) exists and has the expected `BIGINT` primary key. Migration `002` creates the full `recall` schema.

---

## Roadmap / Not Yet Implemented

The following are intentional next steps, not oversights:

- **LLM fallback summarizer** — When Gemini does not produce a native summary (e.g. short meeting, free tier), fall back to an LLM (e.g. OpenAI GPT-4o) to generate one from the transcript. Not in scope for this release.
- **CI/CD pipeline** — GitHub Actions or similar for automated test + lint + deploy on merge.
- **AWS deployment** — ECS/Fargate task definition, RDS PostgreSQL, ElastiCache Redis, ALB, and environment-specific config. Cloud infrastructure not yet provisioned.
- **JWT blocklist** — The current logout endpoint is stateless. Production should maintain a Redis set of revoked token JTIs.
- **RS256 JWT keys** — For higher security, replace the shared HS256 secret with an RS256 keypair so the private key never leaves Recall.
