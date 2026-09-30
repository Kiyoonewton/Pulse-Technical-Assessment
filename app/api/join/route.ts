import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { hashToken, isValidToken, readSessionToken } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = readSessionToken(request);

  if (!isValidToken(token)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonObject(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng } = body as Record<string, unknown>;

  if (typeof id !== "string" || id.length < 8 || id.length > 64) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const tokenHash = hashToken(token);

  // A retry by the owner only refreshes the heartbeat.
  // Preserve the existing privacy offset and busy status.
  const existing = await prisma.presence.updateMany({
    where: { id, tokenHash },
    data: { lastSeen: new Date() },
  });

  if (existing.count > 0) {
    return Response.json({ ok: true });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);

  try {
    await prisma.presence.create({
      data: {
        id,
        tokenHash,
        lat: offset.lat,
        lng: offset.lng,
        busy: false,
        lastSeen: new Date(),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "session id unavailable" },
        { status: 409 },
      );
    }

    throw error;
  }

  return Response.json({ ok: true });
}
