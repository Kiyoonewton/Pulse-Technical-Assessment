import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";

type RateLimitRow = {
  count: number;
  retryAfter: number;
};

export function joinRateLimitSubject(request: Request): string | null {
  if (process.env.VERCEL !== "1") {
    // Local tests share one bucket. Ignore spoofable forwarding headers.
    return "non-vercel-shared";
  }

  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();

  return ip && isIP(ip) !== 0 ? ip : null;
}

export async function enforceRateLimit(
  scope: string,
  subject: string,
  limit: number,
): Promise<Response | null> {
  const secret = process.env.RATE_LIMIT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("RATE_LIMIT_SECRET must contain at least 32 characters");
  }

  const key = createHmac("sha256", secret)
    .update(JSON.stringify([scope, subject]))
    .digest("hex");

  // One atomic statement: concurrent requests cannot overwrite increments.
  // Database time keeps the window consistent across server instances.
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (
      ${key},
      1,
      (statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '1 minute'
    )
    ON CONFLICT ("key") DO UPDATE
    SET
      "count" = CASE
        WHEN "RateLimit"."resetAt" <=
          (statement_timestamp() AT TIME ZONE 'UTC')
        THEN 1
        ELSE LEAST("RateLimit"."count" + 1, ${limit + 1}::integer)
      END,
      "resetAt" = CASE
        WHEN "RateLimit"."resetAt" <=
          (statement_timestamp() AT TIME ZONE 'UTC')
        THEN EXCLUDED."resetAt"
        ELSE "RateLimit"."resetAt"
      END
    RETURNING
      "count",
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (
          "resetAt" - (statement_timestamp() AT TIME ZONE 'UTC')
        )))
      )::integer AS "retryAfter"
  `;

  const result = rows[0];

  if (!result) {
    throw new Error("Rate-limit counter returned no result");
  }

  if (result.count <= limit) return null;

  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function cleanExpiredRateLimits(): Promise<void> {
  // Traffic-driven cleanup; retain a one-hour margin after expiry.
  await prisma.rateLimit.deleteMany({
    where: {
      resetAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
  });
}
