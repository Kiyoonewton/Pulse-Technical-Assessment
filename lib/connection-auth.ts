import type { Prisma } from "@prisma/client";
import type { SignalType } from "@/lib/types";

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

export async function authorizeConnectionSignal(
  tx: Prisma.TransactionClient,
  fromId: string,
  toId: string,
  type: Exclude<SignalType, "request">,
  connectionId: string,
) {
  const membership = await tx.connectionMember.findUnique({
    where: { presenceId: fromId },
    include: {
      connection: {
        include: { members: true },
      },
    },
  });

  if (!membership) {
    throw new ConnectionError("No matching connection", 403);
  }

  const connection = membership.connection;

  if (!connection || connection.id !== connectionId) {
    throw new ConnectionError("Stale or mismatched connection", 409);
  }

  const correctPair =
    (connection.requesterId === fromId && connection.recipientId === toId) ||
    (connection.requesterId === toId && connection.recipientId === fromId);

  const bothMembersPresent =
    connection.members.length === 2 &&
    connection.members.some((member) => member.presenceId === fromId) &&
    connection.members.some((member) => member.presenceId === toId);

  if (!correctPair || !bothMembersPresent) {
    throw new ConnectionError("Not a participant in this connection", 403);
  }

  if (
    connection.status === "PENDING" &&
    connection.expiresAt.getTime() <= Date.now()
  ) {
    throw new ConnectionError("Connection request expired", 409);
  }

  switch (type) {
    case "accept":
    case "decline":
      if (
        connection.status !== "PENDING" ||
        connection.recipientId !== fromId
      ) {
        throw new ConnectionError(
          "Only the recipient may respond to a pending request",
          403,
        );
      }
      break;

    case "offer":
    case "answer":
    case "ice":
      if (connection.status !== "ACTIVE") {
        throw new ConnectionError("Connection has not been accepted", 409);
      }
      break;

    case "end":
      if (
        connection.status === "PENDING" &&
        connection.requesterId !== fromId
      ) {
        throw new ConnectionError(
          "Only the requester may cancel a pending request",
          403,
        );
      }
      break;
  }

  return connection;
}
