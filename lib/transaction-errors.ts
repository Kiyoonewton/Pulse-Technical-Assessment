export function isTransactionConflict(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object") return false;

    const value = current as Record<string, unknown>;

    if (
      value.code === "P2034" ||
      value.code === "40001" ||
      value.code === "40P01" ||
      value.originalCode === "40001" ||
      value.originalCode === "40P01" ||
      value.kind === "TransactionWriteConflict"
    ) {
      return true;
    }

    current = value.cause;
  }

  return false;
}

export async function waitBeforeRetry(attempt: number): Promise<void> {
  const delay = 100 * 2 ** attempt + Math.floor(Math.random() * 100);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}
