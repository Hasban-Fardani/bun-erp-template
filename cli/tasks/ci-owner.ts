/**
 * Creates the CI owner from `.data/qa/credentials.json`.
 *
 * The command runs in this process through the CLI registry, so the password never reaches an
 * argv array and cannot leak into `ps` output. `user:create` is the documented form:
 * `--role owner --name Admin` (the positional role is legacy and not used here).
 */
import { resolve } from "node:path";
import { parseQaCredentials } from "../lib/qa-credentials.ts";
import { repoRoot } from "../lib/repo.ts";
import { runCommand } from "../registry.ts";

const credentialsPath = resolve(repoRoot, ".data/qa/credentials.json");
const file = Bun.file(credentialsPath);
if (!(await file.exists())) {
  throw new Error(`${credentialsPath} is missing; run \`bun loom ci:prepare\` first`);
}
const credentials = parseQaCredentials(await file.json().catch(() => undefined));

const handled = await runCommand("user:create", [
  credentials.email,
  credentials.password,
  "--role",
  "owner",
  "--name",
  "Admin",
]);
if (!handled) {
  throw new Error("user:create is unavailable; install the server app with `bun loom init` first");
}
