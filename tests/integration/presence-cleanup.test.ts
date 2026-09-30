import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { cleanupConnections } from "@/lib/connection-cleanup";
import { STALE_MS } from "@/lib/presence";
import { connect, joinSession, leave, pollOk, send } from "../support/api";
import { prisma, resetDatabase, secondsAgo } from "../support/db";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const STALE_SECONDS = STALE_MS / 1000;

function setLastSeen(id: string, lastSeen: Date) {
  return prisma.presence.update({ where: { id }, data: { lastSeen } });
}

async function lastSeenOf(id: string) {
  const presence = await prisma.presence.findUniqueOrThrow({ where: { id } });
  return presence.lastSeen.getTime();
}

describe("presence and cleanup", () => {
  test("polling refreshes only the caller's heartbeat", async () => {
    const a = await joinSession();
    const b = await joinSession();
    const earlier = secondsAgo(STALE_SECONDS / 2);
    await setLastSeen(a.id, earlier);
    await setLastSeen(b.id, earlier);

    const startedAt = Date.now();
    await pollOk(a);

    assert.ok((await lastSeenOf(a.id)) >= startedAt, "caller refreshed");
    assert.equal(await lastSeenOf(b.id), earlier.getTime(), "peer untouched");
  });

  test("expired participants disappear while active ones remain", async () => {
    const a = await joinSession();
    const active = await joinSession();
    const expired = await joinSession();
    await setLastSeen(active.id, secondsAgo(STALE_SECONDS - 5));
    await setLastSeen(expired.id, secondsAgo(STALE_SECONDS + 5));

    const body = await pollOk(a);

    assert.deepEqual(
      body.peers.map((peer) => peer.id),
      [active.id],
    );
    assert.equal(await prisma.presence.count({ where: { id: expired.id } }), 0);
    assert.equal(await prisma.presence.count({ where: { id: active.id } }), 1);
  });

  test("ending a connection releases both memberships", async () => {
    const a = await joinSession();
    const b = await joinSession();
    const observer = await joinSession();
    const connectionId = await connect(a, b);

    const busyView = await pollOk(observer);
    assert.deepEqual(
      busyView.peers.map((peer) => peer.busy),
      [true, true],
    );

    assert.equal((await send(a, b, "end", connectionId)).status, 200);

    assert.equal(await prisma.connectionMember.count(), 0);
    assert.equal(await prisma.connection.count(), 0);

    const freeView = await pollOk(observer);
    assert.deepEqual(
      freeView.peers.map((peer) => peer.busy),
      [false, false],
    );

    // B is told the connection ended.
    const bInbox = await pollOk(b);
    assert.ok(
      bInbox.signals.some(
        (s) => s.type === "end" && s.connectionId === connectionId,
      ),
    );
  });

  test("leaving mid-connection releases it and notifies the partner", async () => {
    const a = await joinSession();
    const b = await joinSession();
    const connectionId = await connect(a, b);
    await pollOk(b); // Drain the request signal.

    assert.equal((await leave(a.id, a.token)).status, 200);

    assert.equal(await prisma.presence.count({ where: { id: a.id } }), 0);
    assert.equal(await prisma.connection.count(), 0);
    assert.equal(await prisma.connectionMember.count(), 0);

    const body = await pollOk(b);
    assert.deepEqual(
      body.signals.map((s) => [s.type, s.fromId, s.connectionId]),
      [["end", a.id, connectionId]],
    );
    assert.deepEqual(body.peers, [], "the leaver is no longer on the map");
  });

  test("a partner going stale releases the connection and notifies the survivor", async () => {
    const a = await joinSession();
    const b = await joinSession();
    const connectionId = await connect(a, b);
    await pollOk(a); // Drain the accept signal.
    await setLastSeen(b.id, secondsAgo(STALE_SECONDS + 5));

    const body = await pollOk(a);

    assert.equal(await prisma.connection.count(), 0);
    assert.equal(await prisma.connectionMember.count(), 0);
    assert.deepEqual(
      body.signals.map((s) => [s.type, s.connectionId]),
      [["end", connectionId]],
    );
  });

  test("repeating cleanup is safe and idempotent", async () => {
    const a = await joinSession();
    const b = await joinSession();
    await connect(a, b);
    await pollOk(a);
    await setLastSeen(b.id, secondsAgo(STALE_SECONDS + 5));

    await cleanupConnections(a.id);
    const afterFirst = await prisma.signal.findMany({ where: { toId: a.id } });

    await cleanupConnections(a.id);
    await cleanupConnections(a.id);

    assert.equal(await prisma.connection.count(), 0);
    assert.deepEqual(
      await prisma.signal.findMany({ where: { toId: a.id } }),
      afterFirst,
      "no duplicate end notifications",
    );
    assert.equal(afterFirst.length, 1);
  });

  test("an unrelated idle poll does not disturb a healthy connection", async () => {
    const a = await joinSession();
    const b = await joinSession();
    const connectionId = await connect(a, b);

    await pollOk(a);
    await pollOk(b);

    const connection = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
      include: { members: true },
    });
    assert.equal(connection.status, "ACTIVE");
    assert.equal(connection.members.length, 2);
  });
});
