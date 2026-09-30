import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { DEFAULT_INTENTION, INTENTIONS } from "@/lib/intentions";
import { errorOf, join, joinSession, newToken, pollOk } from "../support/api";
import { prisma, resetDatabase } from "../support/db";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

describe("conversation intentions", () => {
  test("every allowed intention is stored and returned with peers", async () => {
    const viewer = await joinSession();
    const expected = new Map<string, string>();

    for (const option of INTENTIONS) {
      const peer = await joinSession({ intention: option.id });
      expected.set(peer.id, option.id);
    }

    const body = await pollOk(viewer);
    const returned = new Map(body.peers.map((p) => [p.id, p.intention]));

    assert.deepEqual(returned, expected);
  });

  test("an unknown intention is rejected and nothing is stored", async () => {
    const id = randomUUID();

    for (const intention of ["DATING", "chat", "", null, 42]) {
      const response = await join(
        { id, lat: 51.5, lng: -0.12, intention },
        newToken(),
      );
      assert.equal(response.status, 400, `intention ${JSON.stringify(intention)}`);
      assert.equal(await errorOf(response), "invalid intention");
    }

    assert.equal(await prisma.presence.count(), 0);
  });

  test("omitting the intention uses the documented default", async () => {
    const viewer = await joinSession();
    const peer = await joinSession();

    const body = await pollOk(viewer);
    const returned = body.peers.find((p) => p.id === peer.id);

    assert.equal(DEFAULT_INTENTION, "CHAT");
    assert.equal(returned?.intention, DEFAULT_INTENTION);
  });
});
