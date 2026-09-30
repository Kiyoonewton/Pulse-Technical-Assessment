import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { readSessionToken, requireSession } from "@/lib/session";
import { cleanupConnections } from "@/lib/connection-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const denied = await requireSession(id, readSessionToken(request));
  if (denied) return denied;

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);

  // 1) Heartbeat — refresh lastSeen for the caller.
  const heartbeat = await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  if (heartbeat.count === 0) {
    return Response.json({ error: "presence_expired" }, { status: 410 });
  }

  // 2) Release connections before removing expired participants.
  await cleanupConnections(id);

  // Independent expiry queries do not need an interactive transaction.
  await Promise.all([
    prisma.presence.deleteMany({
      where: { lastSeen: { lt: staleCutoff } },
    }),
    prisma.signal.deleteMany({
      where: {
        createdAt: {
          lt: new Date(now - SIGNAL_TTL_MS),
        },
      },
    }),
  ]);

  await prisma.connection.deleteMany({
    where: { members: { none: {} } },
  });

  // 3) Online peers, excluding self.
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      connectionMember: {
        select: { connectionId: true },
      },
    },
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromId: true,
      toId: true,
      type: true,
      payload: true,
      createdAt: true,
      connectionId: true,
    },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.connectionMember != null,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
      connectionId: s.connectionId,
    })),
  };

  return Response.json(response);
}
