type BodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<BodyResult> {
  const fail = (error: string, status: number): BodyResult => ({
    ok: false,
    response: Response.json({ error }, { status }),
  });

  if (!request.body) {
    return fail("invalid body", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return fail("request body too large", 413);
      }

      chunks.push(value);
    }
  } catch {
    return fail("could not read body", 400);
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = Buffer.concat(chunks, totalBytes);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body: unknown = JSON.parse(text);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("body must be a JSON object", 400);
    }

    return {
      ok: true,
      body: body as Record<string, unknown>,
    };
  } catch {
    return fail("invalid JSON", 400);
  }
}
