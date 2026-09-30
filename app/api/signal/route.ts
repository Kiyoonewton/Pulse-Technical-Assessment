import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import type { SignalType } from "@/lib/types";
import {
  hashToken,
  isValidToken,
  readSessionToken,
  requireSession,
} from "@/lib/session";
import {
  authorizeConnectionSignal,
  ConnectionError,
} from "@/lib/connection-auth";
import {
  isTransactionConflict,
  waitBeforeRetry,
} from "@/lib/transaction-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 64 * 1024;
const REQUEST_TTL_MS = 30_000;

async function processSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload: string | null,
  token: string,
  connectionId: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const cutoff = new Date(now.getTime() - STALE_MS);

          // Recheck session ownership inside the transaction.
          const sender = await tx.presence.findUnique({
            where: { id: fromId },
          });

          if (
            !sender ||
            sender.lastSeen < cutoff ||
            sender.tokenHash !== hashToken(token)
          ) {
            throw new ConnectionError("Session unavailable", 401);
          }

          if (type === "request") {
            // Check for a repeated request before reserving participants.
            const existing = await tx.connection.findUnique({
              where: { id: connectionId },
            });

            if (existing) {
              if (
                existing.requesterId === fromId &&
                existing.recipientId === toId &&
                existing.status === "PENDING" &&
                existing.expiresAt > now
              ) {
                return { ok: true };
              }

              throw new ConnectionError("Connection id unavailable", 409);
            }

            const target = await tx.presence.findUnique({
              where: { id: toId },
            });

            const occupied = await tx.connectionMember.findMany({
              where: {
                presenceId: { in: [fromId, toId] },
              },
            });

            if (!target || target.lastSeen < cutoff || occupied.length > 0) {
              await tx.signal.create({
                data: {
                  fromId: toId,
                  toId: fromId,
                  type: "decline",
                  connectionId,
                },
              });

              return { ok: true, autoDeclined: true };
            }

            await tx.connection.create({
              data: {
                id: connectionId,
                requesterId: fromId,
                recipientId: toId,
                status: "PENDING",
                expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
                members: {
                  create: [{ presenceId: fromId }, { presenceId: toId }],
                },
              },
            });
          } else {
            // All subsequent signals must match the current connection.
            const connection = await authorizeConnectionSignal(
              tx,
              fromId,
              toId,
              type,
              connectionId,
            );

            if (type === "accept") {
              await tx.connection.update({
                where: { id: connection.id },
                data: { status: "ACTIVE" },
              });
            } else if (type === "decline" || type === "end") {
              // Remove queued signals only for this connection.
              await tx.signal.deleteMany({
                where: { connectionId: connection.id },
              });

              // Cascading deletion releases both membership reservations.
              await tx.connection.delete({
                where: { id: connection.id },
              });
            }
          }

          // End/decline notifications survive connection deletion.
          await tx.signal.create({
            data: {
              fromId,
              toId,
              type,
              payload,
              connectionId,
            },
          });

          return { ok: true };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      const retryable =
        isTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002");

      if (retryable && attempt < 2) {
        await waitBeforeRetry(attempt);
        continue;
      }

      if (retryable) {
        throw new ConnectionError("Connection changed. Please try again.", 409);
      }

      throw error;
    }
  }

  throw new ConnectionError("Unable to process signal", 409);
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, toId, type, payload, connectionId } = body as Record<
    string,
    unknown
  >;

  if (
    typeof fromId !== "string" ||
    typeof toId !== "string" ||
    fromId.length < 8 ||
    fromId.length > 64 ||
    toId.length < 8 ||
    toId.length > 64 ||
    fromId === toId
  ) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }

  const token = readSessionToken(request);

  if (!isValidToken(token)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const denied = await requireSession(fromId, token);
  if (denied) return denied;

  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }

  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" ||
      Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD)
  ) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  if (
    typeof connectionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      connectionId,
    )
  ) {
    return Response.json({ error: "invalid connection id" }, { status: 400 });
  }

  try {
    const result = await processSignal(
      fromId,
      toId,
      type as SignalType,
      typeof payload === "string" ? payload : null,
      token,
      connectionId,
    );

    return Response.json(result);
  } catch (error) {
    if (error instanceof ConnectionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
