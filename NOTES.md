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

## Phase 2 — Make it good

- Not started.

## Phase 3 — Make it secure

- Initial code inspection found that polling and signaling trust
  client-supplied session IDs without verifying ownership.
  High-priority finding; not fixed yet.
- Full security review pending.

## Phase 4 — Make it better

- Not started.
