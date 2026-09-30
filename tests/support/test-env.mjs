// Resolves the isolated test database and refuses anything that could be the
// application's development or production database.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(fileURLToPath(import.meta.url), "../../..");

function readEnvFile(name) {
  const file = path.join(root, name);
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

// Neon exposes the same database through "<endpoint>" and "<endpoint>-pooler".
function databaseIdentity(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  return `${host}:${port}/${database}`;
}

export function resolveTestDatabaseUrl() {
  const appEnv = readEnvFile(".env");
  const testEnv = readEnvFile(".env.test");

  const testUrl = process.env.TEST_DATABASE_URL ?? testEnv.TEST_DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a disposable database " +
        "whose name contains \"test\" (see TESTING.md).",
    );
  }

  const testIdentity = databaseIdentity(testUrl);
  const database = testIdentity.slice(testIdentity.lastIndexOf("/") + 1);

  if (!/test/i.test(database)) {
    throw new Error(
      `Refusing to use database "${database}": its name must contain "test".`,
    );
  }

  const protectedUrls = [
    appEnv.DATABASE_URL,
    appEnv.DIRECT_URL,
    // Values injected by the shell before we override them.
    process.env.PULSE_APP_DATABASE_URL ?? process.env.DATABASE_URL,
    process.env.PULSE_APP_DIRECT_URL ?? process.env.DIRECT_URL,
  ].filter((value) => typeof value === "string" && value.length > 0);

  for (const appUrl of protectedUrls) {
    if (appUrl === testUrl || databaseIdentity(appUrl) === testIdentity) {
      throw new Error(
        "Refusing to run: TEST_DATABASE_URL points at the application's " +
          "DATABASE_URL or DIRECT_URL.",
      );
    }
  }

  return testUrl;
}

// Point every database consumer (Prisma client and Prisma CLI) at the test
// database, with deterministic local settings.
export function applyTestEnv() {
  const testUrl = resolveTestDatabaseUrl();

  process.env.PULSE_APP_DATABASE_URL ??= process.env.DATABASE_URL ?? "";
  process.env.PULSE_APP_DIRECT_URL ??= process.env.DIRECT_URL ?? "";
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;
  process.env.RATE_LIMIT_SECRET = "pulse-test-rate-limit-secret-0123456789";
  // Use the shared local rate-limit bucket, not forwarded-IP handling.
  delete process.env.VERCEL;

  return testUrl;
}
