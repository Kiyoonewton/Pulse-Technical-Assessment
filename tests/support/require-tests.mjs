// node --test exits 0 when a pattern matches no files. Fail instead, so a
// moved or renamed suite can never pass by silently running zero tests.
import { globSync } from "node:fs";

const pattern = process.argv[2];
const files = pattern ? globSync(pattern) : [];

if (files.length === 0) {
  console.error(`No test files match ${pattern ?? "(no pattern given)"}`);
  process.exit(1);
}
