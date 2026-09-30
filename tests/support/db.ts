import { prisma } from "@/lib/prisma";

export { prisma };

// Every integration test starts from empty coordination tables.
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Signal", "ConnectionMember", "Connection", "Presence", "RateLimit" CASCADE',
  );
}

export function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}
