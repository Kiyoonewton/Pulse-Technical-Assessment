// Preloaded before integration tests so lib/prisma connects to the test
// database. Throws (failing the run) if the database is not provably isolated.
import { applyTestEnv } from "./test-env.mjs";

applyTestEnv();
