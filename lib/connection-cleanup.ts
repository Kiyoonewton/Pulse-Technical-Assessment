import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import {
  isTransactionConflict,
  waitBeforeRetry,
} from "@/lib/transaction-errors";

const connectionInclude = {
  members: {
    include: {
      presence: {
        select: { lastSeen: true },
      },
    },
  },
} satisfies Prisma.ConnectionInclude;

type ConnectionWithMembers = Prisma.ConnectionGetPayload<{
  include: typeof connectionInclude;
}>;

function needsCleanup(connection: ConnectionWithMembers, now: Date): boolean {
  const cutoff = new Date(now.getTime() - STALE_MS);

  return (
    connection.members.length !== 2 ||
    (connection.status === "PENDING" && connection.expiresAt <= now) ||
    connection.members.some(
      (member: ConnectionWithMembers["members"][number]) =>
        !member.presence || member.presence.lastSeen < cutoff,
    )
  );
}

// Supplying leavingTokenHash means this participant is leaving.
export async function cleanupConnections(
  participantId: string,
  leavingTokenHash?: string,
): Promise<void> {
  // Normal polling needs no transaction for an idle or healthy session.
  if (leavingTokenHash === undefined) {
    const membership = await prisma.connectionMember.findUnique({
      where: { presenceId: participantId },
      include: {
        connection: { include: connectionInclude },
      },
    });

    const connection = membership?.connection;

    if (!connection || !needsCleanup(connection, new Date())) {
      return;
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          if (leavingTokenHash !== undefined) {
            const owner = await tx.presence.findUnique({
              where: { id: participantId },
              select: { tokenHash: true },
            });

            if (!owner || owner.tokenHash !== leavingTokenHash) {
              return;
            }
          }

          // Re-read inside the transaction: the connection may have changed.
          const membership = await tx.connectionMember.findUnique({
            where: { presenceId: participantId },
            include: {
              connection: { include: connectionInclude },
            },
          });

          const connection = membership?.connection;
          const now = new Date();
          const cutoff = new Date(now.getTime() - STALE_MS);

          if (
            connection &&
            (leavingTokenHash !== undefined || needsCleanup(connection, now))
          ) {
            const { requesterId, recipientId } = connection;

            await tx.signal.deleteMany({
              where: {
                OR: [
                  { fromId: requesterId, toId: recipientId },
                  { fromId: recipientId, toId: requesterId },
                ],
              },
            });

            await tx.connection.delete({
              where: { id: connection.id },
            });

            const notifications = connection.members
              .filter(
                (member: ConnectionWithMembers["members"][number]) =>
                  member.presence != null &&
                  member.presence.lastSeen >= cutoff &&
                  !(
                    leavingTokenHash !== undefined &&
                    member.presenceId === participantId
                  ),
              )
              .map((member: ConnectionWithMembers["members"][number]) => ({
                fromId:
                  member.presenceId === requesterId ? recipientId : requesterId,
                toId: member.presenceId,
                type: "end",
              }));

            if (notifications.length > 0) {
              await tx.signal.createMany({ data: notifications });
            }
          }

          if (leavingTokenHash !== undefined) {
            await tx.signal.deleteMany({
              where: { toId: participantId },
            });

            await tx.presence.deleteMany({
              where: {
                id: participantId,
                tokenHash: leavingTokenHash,
              },
            });
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return;
    } catch (error) {
      if (isTransactionConflict(error) && attempt < 2) {
        await waitBeforeRetry(attempt);
        continue;
      }

      throw error;
    }
  }
}
