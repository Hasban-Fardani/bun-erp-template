import { join } from "node:path";
import { directoryExists } from "./exists.ts";

/**
 * Migrations run in filename order, so `NNNN_snake_case.ts` is the contract. The gate returns
 * findings instead of exiting: `check` dispatches it in-process and `guard` owns the exit.
 */
export async function checkMigrations(root: string): Promise<string[]> {
  const directory = join(root, "apps/server/database/migrations");
  // `apps/` ships empty; a missing server app is a clean skip, not a missing-directory crash.
  if (!(await directoryExists(directory))) return [];
  const files = [...new Bun.Glob("*").scanSync({ cwd: directory })].sort();
  const bad = files.filter((file) => !/^\d{4}_[a-z0-9_]+\.ts$/.test(file));
  return bad.length > 0 ? [`Migration modules must be NNNN_snake_case.ts: ${bad.join(", ")}`] : [];
}
