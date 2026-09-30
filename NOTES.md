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

## Phase 2 — Make it good

- Not started.

## Phase 3 — Make it secure

- Initial code inspection found that polling and signaling trust
  client-supplied session IDs without verifying ownership.
  High-priority finding; not fixed yet.
- Full security review pending.

## Phase 4 — Make it better

- Not started.
