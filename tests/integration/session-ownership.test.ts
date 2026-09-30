import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import {
  errorOf,
  joinSession,
  leave,
  newToken,
  poll,
  send,
  signal,
} from "../support/api";
import { prisma, resetDatabase, secondsAgo } from "../support/db";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

// A victim with a known heartbeat and an undelivered request in its mailbox.
async function victimWithQueuedSignal() {
  const victim = await joinSession();
  const sender = await joinSession();
  const lastSeen = secondsAgo(5);

  await prisma.presence.update({
    where: { id: victim.id },
    data: { lastSeen },
  });

  const connectionId = randomUUID();
  const requested = await send(sender, victim, "request", connectionId);
  assert.equal(requested.status, 200);

  return { victim, sender, lastSeen, connectionId };
}

async function victimState(id: string) {
  const [presence, signals, membership] = await Promise.all([
    prisma.presence.findUnique({ where: { id } }),
    prisma.signal.count({ where: { toId: id } }),
    prisma.connectionMember.findUnique({ where: { presenceId: id } }),
  ]);
  return { presence, signals, membership };
}

describe("session ownership", () => {
  test("requests without a session token are rejected", async () => {
    const { victim } = await victimWithQueuedSignal();

    const polled = await poll(victim.id);
    assert.equal(polled.status, 401);

    const signalled = await signal({
      fromId: victim.id,
      toId: randomUUID(),
      type: "request",
      connectionId: randomUUID(),
    });
    assert.equal(signalled.status, 401);

    const left = await leave(victim.id, undefined);
    assert.equal(left.status, 401);
  });

  test("another session's token cannot poll, signal or remove the victim", async () => {
    const { victim, sender, lastSeen } = await victimWithQueuedSignal();
    const attacker = await joinSession();
    const before = await victimState(victim.id);
    assert.equal(before.signals, 1);

    // The attacker holds a real, valid token — just not the victim's.
    const polled = await poll(victim.id, attacker.token);
    assert.equal(polled.status, 403);

    const signalled = await signal(
      {
        fromId: victim.id,
        toId: sender.id,
        type: "accept",
        connectionId: randomUUID(),
      },
      attacker.token,
    );
    assert.equal(signalled.status, 403);

    const left = await leave(victim.id, attacker.token);
    assert.equal(left.status, 403);

    // Nothing about the victim changed: the queued request was not drained,
    // the heartbeat was not refreshed and the presence row still exists.
    const afterAttack = await victimState(victim.id);
    assert.equal(afterAttack.signals, 1);
    assert.ok(afterAttack.presence);
    assert.equal(afterAttack.presence.lastSeen.getTime(), lastSeen.getTime());
    assert.deepEqual(afterAttack.membership, before.membership);
    assert.equal(
      await prisma.signal.count({ where: { fromId: victim.id } }),
      0,
      "no signal may be sent in the victim's name",
    );
  });

  test("a well-formed but unknown token is forbidden", async () => {
    const { victim } = await victimWithQueuedSignal();

    const polled = await poll(victim.id, newToken());
    assert.equal(polled.status, 403);
    assert.equal((await victimState(victim.id)).signals, 1);
  });

  test("the owner can poll, receive signals and leave", async () => {
    const { victim, sender, connectionId } = await victimWithQueuedSignal();

    const polled = await poll(victim.id, victim.token);
    assert.equal(polled.status, 200);
    const body = await polled.json();
    assert.deepEqual(
      body.signals.map((s: { type: string; fromId: string; connectionId: string }) => [
        s.type,
        s.fromId,
        s.connectionId,
      ]),
      [["request", sender.id, connectionId]],
    );
    assert.equal((await victimState(victim.id)).signals, 0, "mailbox drained");

    const left = await leave(victim.id, victim.token);
    assert.equal(left.status, 200);
    assert.equal(await prisma.presence.count({ where: { id: victim.id } }), 0);
  });

  test("a session whose presence is gone gets presence_expired", async () => {
    const session = await joinSession();
    await prisma.presence.delete({ where: { id: session.id } });

    const polled = await poll(session.id, session.token);
    assert.equal(polled.status, 410);
    assert.equal(await errorOf(polled), "presence_expired");

    const left = await leave(session.id, session.token);
    assert.equal(left.status, 410);
    assert.equal(await errorOf(left), "presence_expired");
  });
});
