import type { NextRequest } from "next/server";
import { cleanupConnections } from "@/lib/connection-cleanup";
import { hashToken, isValidToken, requireSession } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, token } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  if (!isValidToken(token)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const denied = await requireSession(id, token);
  if (denied) return denied;

  await cleanupConnections(id, hashToken(token));

  return Response.json({ ok: true });
}
