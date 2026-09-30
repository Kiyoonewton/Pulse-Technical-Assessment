import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, token } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const denied = await requireSession(id, token);
  if (denied) return denied;

  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });

  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
