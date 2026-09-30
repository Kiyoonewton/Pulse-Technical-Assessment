# Testing

A small suite focused on Pulse's security boundaries, presence lifecycle and
regressions fixed during the assessment. It uses Node's built-in `node:test`
and the project's existing TypeScript dependency, with no test framework added.

## Setup

Requirements: Node 22.15+ (verified on Node 26.9.0) and a **disposable**
Postgres database.

```bash
# 1. Create an isolated database (example: local Postgres)
createdb pulse_test

# 2. Point the tests at it — via the shell or a gitignored .env.test file
export TEST_DATABASE_URL="postgresql://USER@localhost:5432/pulse_test"

# 3. Run everything (applies committed migrations to the test DB first)
npm test
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests, then integration tests |
| `npm run test:unit` | WebRTC card handling; no database needed |
| `npm run test:integration` | Migrates the test DB, then runs API integration tests serially |
| `npm run test:db:prepare` | Only applies `prisma/migrations` to the test DB |

## Isolation safeguards

Integration tests never touch the development or production database.
`tests/support/test-env.mjs` refuses to run unless:

- `TEST_DATABASE_URL` is set explicitly;
- its database name contains `test`;
- it does not match the app's `DATABASE_URL` or `DIRECT_URL`, compared by host,
  port and database name, so a different user or Neon's `-pooler` hostname
  cannot slip past.

It then overrides `DATABASE_URL`/`DIRECT_URL` for the test process and Prisma
CLI. `prisma.config.ts` loads `.env`, but Node's `loadEnvFile` never overrides
variables that are already set (verified). Each test truncates the coordination
tables first, and files run with `--test-concurrency=1`.

## Approach

- **Integration tests** call the real route handlers (`app/api/*/route.ts`)
  in-process with real `Request` objects against real Postgres, then assert
  both the HTTP response and the resulting database state.
- **Time is controlled, not waited for:** tests move `lastSeen`, `expiresAt`
  and rate-limit `resetAt` into the past instead of sleeping 15–60 seconds.
- **Only the browser boundary is faked:** the card tests replace
  `RTCPeerConnection`/`RTCDataChannel`, which Node lacks.

## Coverage and why it matters

| Area | File | Why |
| --- | --- | --- |
| Session ownership (5) | `session-ownership.test.ts` | Session ids are public (every dot exposes one). Only the token proves ownership. Tests show a foreign token cannot drain a victim's mailbox, refresh their heartbeat, speak for them or remove them. |
| Connection authorization (10) | `connection-authorization.test.ts` | Stops outsiders from accepting, ending or injecting SDP/ICE into another pair's call. Also stops a delayed `end` from an old call killing a newer one. Every rejection asserts an unchanged database. |
| Presence & cleanup (7) | `presence-cleanup.test.ts` | Covers the Phase 1 bug where one poll refreshed everyone's heartbeat, which left ghost dots on the map. Also: expiry, releasing busy state on end/leave/staleness, and idempotent cleanup. |
| Intentions (3) | `intentions.test.ts` | The allowlist keeps free text out of a field every stranger sees. |
| Rate limits (5) | `rate-limits.test.ts` | Uses the exported configured limits (`JOIN_RATE_LIMIT`, etc.). Covers `Retry-After`, window reset, and concurrent bursts against the database-backed counter. |
| Conversation cards (7) | `tests/unit/webrtc-cards.test.ts` | Only allowlisted card IDs reach the UI; malformed data is ignored; sending on a closed channel reports failure. |

## Results (2026-10-01, Node 26.9.0, local Postgres 16)

- `npm test`: **37 passed, 0 failed** (7 unit, 30 integration).
- The integration suite was repeated three times with identical results
  (before the leave-mid-connection test was added).
- `npm run lint` and `npm run build` pass.

**Regression checks.** Each protection was removed locally, the tests were run
to confirm they fail, and then the code was restored. None of these broken
versions were committed.

| Protection removed | Result |
| --- | --- |
| Token hash comparison in `requireSession` | 2 ownership tests fail |
| Stale `connectionId` check | Old-`end` test fails |
| Pair/membership check | "Member reaching an outsider" fails. Outsider tests still pass because the missing-membership check rejects them first, so this check is defence in depth. |
| Heartbeat scoped to the caller (`where: {}`) | 3 presence tests fail |
| Intention validation | Unknown-intention test fails |
| Limit enforcement | All 5 rate-limit tests fail |
| **Atomic upsert → read-then-write counter** | Sequential tests still **pass**. The concurrency tests fail: 40/40 joins got through against a limit of 20, and 185/185 signals against 180. |
| Card ID allowlist on receive | 2 card tests fail |
| Channel-open check on send | Closed-channel test fails |

No test exposed a new bug, so there are no fix commits.

## Known gaps

- Handlers run in-process, not through a running Next server, so framework
  routing and the `sendBeacon` delivery of `/api/leave` are not exercised.
- Vercel's per-IP join limiting (`x-vercel-forwarded-for`) is not covered.
  Locally all joins share one bucket by design.
- The window reset is simulated by moving `resetAt` into the past, not by
  waiting for real database time to pass.
- Concurrency is exercised through one process's connection pool, not across
  separate serverless instances.
- **Mocked WebRTC proves message handling only**, not real ICE negotiation,
  NAT traversal, media or chat delivery between browsers.
- No UI/component tests (e.g. the `page.tsx` connection state machine).
- Data-channel `ctrl` messages are cast without an allowlist. Unknown values
  are ignored by the page's handler today, but this is untested.

## Manual checks still required

Two browser profiles with different mock locations, on the deployed app:
request → accept → chat both ways → share cards both ways → start/stop video
→ end → reconnect. Also: close a tab and confirm its dot disappears within
~15s, and confirm the entry-page intention appears in the other window.
