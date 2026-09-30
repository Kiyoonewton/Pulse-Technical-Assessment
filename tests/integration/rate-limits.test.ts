import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import {
  CONNECTION_REQUEST_RATE_LIMIT,
  JOIN_RATE_LIMIT,
  SIGNAL_RATE_LIMIT,
} from "@/lib/rate-limit";
import { join, joinSession, newToken, send, signal } from "../support/api";
import { prisma, resetDatabase, secondsAgo } from "../support/db";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

function freshJoin() {
  return join({ id: randomUUID(), lat: 0, lng: 0 }, newToken());
}

function assertLimited(response: Response) {
  assert.equal(response.status, 429);
  const retryAfter = Number(response.headers.get("Retry-After"));
  assert.ok(
    Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60,
    `Retry-After should be 1–60 seconds, got ${response.headers.get("Retry-After")}`,
  );
}

// Move every open window into the past, as if a minute had elapsed.
function expireWindows() {
  return prisma.rateLimit.updateMany({ data: { resetAt: secondsAgo(1) } });
}

describe("shared rate limits", () => {
  test("join allows the configured count, then limits with Retry-After", async () => {
    for (let i = 0; i < JOIN_RATE_LIMIT; i++) {
      assert.equal((await freshJoin()).status, 200, `join ${i + 1}`);
    }

    assertLimited(await freshJoin());
    assert.equal(await prisma.presence.count(), JOIN_RATE_LIMIT);
  });

  test("the join limit resets after its window", async () => {
    for (let i = 0; i < JOIN_RATE_LIMIT; i++) await freshJoin();
    assertLimited(await freshJoin());

    await expireWindows();

    assert.equal((await freshJoin()).status, 200);
  });

  test("concurrent joins cannot exceed the database-backed limit", async () => {
    const attempts = JOIN_RATE_LIMIT * 2;
    const responses = await Promise.all(
      Array.from({ length: attempts }, () => freshJoin()),
    );
    const statuses = responses.map((r) => r.status);

    assert.equal(statuses.filter((s) => s === 200).length, JOIN_RATE_LIMIT);
    assert.equal(statuses.filter((s) => s === 429).length, attempts - JOIN_RATE_LIMIT);
    assert.equal(await prisma.presence.count(), JOIN_RATE_LIMIT);
  });

  test("signaling is limited per session", async () => {
    const sender = await joinSession();
    const other = await joinSession();

    // The signal limit is counted before the type is validated, so invalid
    // types consume budget without creating connections.
    const body = {
      fromId: sender.id,
      toId: other.id,
      type: "not-a-type",
      connectionId: randomUUID(),
    };
    const responses = await Promise.all(
      Array.from({ length: SIGNAL_RATE_LIMIT + 5 }, () =>
        signal(body, sender.token),
      ),
    );
    const statuses = responses.map((r) => r.status);

    assert.equal(statuses.filter((s) => s === 400).length, SIGNAL_RATE_LIMIT);
    assert.equal(statuses.filter((s) => s === 429).length, 5);
    assertLimited(responses.find((r) => r.status === 429)!);

    // Another session has its own budget.
    const otherResponse = await signal(
      { ...body, fromId: other.id, toId: sender.id },
      other.token,
    );
    assert.equal(otherResponse.status, 400);
  });

  test("connection requests have their own tighter limit", async () => {
    const sender = await joinSession();

    // Requests to offline ids are auto-declined but still count.
    for (let i = 0; i < CONNECTION_REQUEST_RATE_LIMIT; i++) {
      const response = await send(sender, randomUUID(), "request", randomUUID());
      assert.equal(response.status, 200, `request ${i + 1}`);
    }

    assertLimited(await send(sender, randomUUID(), "request", randomUUID()));

    await expireWindows();

    const afterReset = await send(sender, randomUUID(), "request", randomUUID());
    assert.equal(afterReset.status, 200);
  });
});
