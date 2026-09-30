# Assessment Notes

## Phase 1 — Make it run

- Set up Neon Postgres and Mapbox, then tested with two browser
  windows using different mock locations.
- Connection requests arrived, but after acceptance the connection
  stalled for roughly a minute and failed.
- Found that queued ICE candidates were applied before the remote
  description, with errors silently swallowed. Reversed that order.
  The connection succeeded on retest.
- Chat messages were sent with type `"msg"`, while the receiver
  expected `"chat"`. Aligned the outgoing type with the receiver.
  Verified messages arrive in both directions.
- Verified video starts in both windows and text chat still works
  after ending video.
- Still to verify: reconnecting after ending the full connection,
  stale presence cleanup, and repeated connection attempts.
- Reconnecting after ending a chat was automatically declined because
  the server left both participants marked busy. Added `"end"` to
  busy-state cleanup. Verified reconnection and messaging without
  refreshing either window.
- Each poll refreshed every participant's heartbeat, preventing stale
  users from expiring while anyone remained online. Scoped heartbeat
  updates to the caller. Verified that a participant taken offline
  disappears from the other participant's map after the expiry period.
- After presence expired, the returning browser kept polling without
  restoring its map presence. The API now returns 410 for missing
  presence; the client closes its old connection and returns to entry.
  Verified re-entry restores visibility and allows connecting again.
  Chose explicit re-entry rather than silently resuming an old chat.
- Verified declining a request allows another attempt. Cancelling an
  outgoing request dismisses the recipient's prompt, and a fresh
  connection succeeds without reloading.
- Verified closing a participant's window during chat ends the other
  participant's chat, returns them to the map, and removes the departed
  participant's dot.
- Lint and production build passed after the Phase 1 fixes.

## Phase 2 — Make it good

- Not started.

## Phase 3 — Make it secure

- **High priority — session impersonation:** Polling trusted a public
  participant ID without proof of ownership. Confirmed an unauthenticated
  request returned 200. Added private session tokens, stored only their
  hashes, and enforced ownership checks on join, poll, signal, and leave.
- **Verification:** Polling returns 401 without a token and 403 with an
  incorrect token. Lint and production build passed. Legitimate participants
  can still connect, exchange messages, and use video.
- **High priority — missing connection authorization:** An authenticated
  third participant sent an unrelated `"end"` signal and received 200.
  Session ownership does not establish connection membership. Fix pending:
  track connections server-side and enforce participant and state checks
  before delivering signals or changing busy status.
- Further input-validation and abuse-control review remains pending.
- Added server-side connection records and participant/state checks.
  Verified an authenticated third participant's unrelated end signal
  returns 403, while the legitimate participants can still chat.
- Availability now derives from connection membership. Verified
  closing a participant's window completes cleanup without HTTP 500s
  in the latest retest.
- Delayed-signal protection and further abuse controls remain pending.

## Phase 4 — Make it better

- Not started.
