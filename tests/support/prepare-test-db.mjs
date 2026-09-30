// Applies the committed migrations to the isolated test database only.
import { spawnSync } from "node:child_process";
import { applyTestEnv } from "./test-env.mjs";

let testUrl;
try {
  testUrl = applyTestEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { hostname, pathname } = new URL(testUrl);
console.log(`Applying migrations to test database ${hostname}${pathname}`);

// prisma.config.ts loads .env, but never overrides variables already set here.
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
