import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function isValidToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export async function requireSession(
  id: string,
  token: unknown,
): Promise<Response | null> {
  if (!isValidToken(token)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const presence = await prisma.presence.findUnique({
    where: { id },
    select: { tokenHash: true },
  });

  if (!presence) {
    return Response.json({ error: "presence_expired" }, { status: 410 });
  }

  if (!presence.tokenHash) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const expected = Buffer.from(presence.tokenHash, "hex");
  const supplied = Buffer.from(hashToken(token), "hex");

  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return null;
}
