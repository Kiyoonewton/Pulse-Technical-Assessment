import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { connect, joinSession, send, type Session } from "../support/api";
import { prisma, resetDatabase, secondsAgo } from "../support/db";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

async function snapshot() {
  const [connections, members, signals] = await Promise.all([
    prisma.connection.findMany({
      orderBy: { id: "asc" },
      select: { id: true, status: true, requesterId: true, recipientId: true },
    }),
    prisma.connectionMember.findMany({
      orderBy: { presenceId: "asc" },
      select: { presenceId: true, connectionId: true },
    }),
    prisma.signal.findMany({
      orderBy: { id: "asc" },
      select: { id: true, fromId: true, toId: true, type: true },
    }),
  ]);
  return { connections, members, signals };
}

// Expect a rejection and prove the database was left exactly as it was.
async function assertRejectedWithoutChanges(
  attempt: () => Promise<Response>,
  status: number,
) {
  const before = await snapshot();
  const response = await attempt();
  assert.equal(response.status, status);
  assert.deepEqual(await snapshot(), before);
}

describe("connection authorization", () => {
  let a: Session;
  let b: Session;
  let outsider: Session;

  beforeEach(async () => {
    a = await joinSession();
    b = await joinSession();
    outsider = await joinSession();
  });

  test("a third participant cannot accept another pair's pending request", async () => {
    const connectionId = randomUUID();
    assert.equal((await send(a, b, "request", connectionId)).status, 200);

    await assertRejectedWithoutChanges(
      () => send(outsider, a, "accept", connectionId),
      403,
    );

    const connection = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    assert.equal(connection.status, "PENDING");
  });

  test("a third participant cannot end or signal into an active connection", async () => {
    const connectionId = await connect(a, b);

    await assertRejectedWithoutChanges(
      () => send(outsider, a, "end", connectionId),
      403,
    );
    await assertRejectedWithoutChanges(
      () => send(outsider, b, "offer", connectionId, '{"type":"offer"}'),
      403,
    );
    await assertRejectedWithoutChanges(
      () => send(outsider, a, "ice", connectionId, "{}"),
      403,
    );
  });

  test("a member cannot use their connection id to reach an outsider", async () => {
    const connectionId = await connect(a, b);

    await assertRejectedWithoutChanges(
      () => send(a, outsider, "offer", connectionId, '{"type":"offer"}'),
      403,
    );
  });

  test("an old connection's end cannot terminate a newer connection", async () => {
    const oldConnectionId = await connect(a, b);
    assert.equal((await send(a, b, "end", oldConnectionId)).status, 200);

    const newConnectionId = await connect(a, b);

    await assertRejectedWithoutChanges(
      () => send(b, a, "end", oldConnectionId),
      409,
    );

    const current = await prisma.connection.findUniqueOrThrow({
      where: { id: newConnectionId },
      include: { members: true },
    });
    assert.equal(current.status, "ACTIVE");
    assert.equal(current.members.length, 2);
  });

  describe("invalid state transitions", () => {
    test("the requester cannot accept their own request", async () => {
      const connectionId = randomUUID();
      await send(a, b, "request", connectionId);

      await assertRejectedWithoutChanges(
        () => send(a, b, "accept", connectionId),
        403,
      );
    });

    test("WebRTC signaling is refused before the request is accepted", async () => {
      const connectionId = randomUUID();
      await send(a, b, "request", connectionId);

      await assertRejectedWithoutChanges(
        () => send(a, b, "offer", connectionId, '{"type":"offer"}'),
        409,
      );
    });

    test("an expired pending request cannot be accepted", async () => {
      const connectionId = randomUUID();
      await send(a, b, "request", connectionId);
      await prisma.connection.update({
        where: { id: connectionId },
        data: { expiresAt: secondsAgo(1) },
      });

      await assertRejectedWithoutChanges(
        () => send(b, a, "accept", connectionId),
        409,
      );
    });

    test("an active connection cannot be accepted or declined again", async () => {
      const connectionId = await connect(a, b);

      await assertRejectedWithoutChanges(
        () => send(b, a, "accept", connectionId),
        403,
      );
      await assertRejectedWithoutChanges(
        () => send(b, a, "decline", connectionId),
        403,
      );
    });

    test("only the requester may cancel a pending request with end", async () => {
      const connectionId = randomUUID();
      await send(a, b, "request", connectionId);

      await assertRejectedWithoutChanges(
        () => send(b, a, "end", connectionId),
        403,
      );

      // The legitimate cancellation still works.
      assert.equal((await send(a, b, "end", connectionId)).status, 200);
      assert.equal(await prisma.connection.count(), 0);
    });
  });

  test("a busy participant is auto-declined instead of double-booked", async () => {
    await connect(a, b);
    const connectionId = randomUUID();

    const response = await send(outsider, a, "request", connectionId);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, autoDeclined: true });

    assert.equal(
      await prisma.connection.count({ where: { id: connectionId } }),
      0,
    );
    const declined = await prisma.signal.findFirstOrThrow({
      where: { toId: outsider.id, connectionId },
    });
    assert.equal(declined.type, "decline");
  });
});
