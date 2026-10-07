/**
 * Normalize Drizzle query results at the one boundary used by queries, jobs and migrations.
 * Kept separate from `migrate.ts` so the Worker request graph never reaches DDL code: jobs and
 * schedulers import this module, and a re-export from `migrate.ts` used to drag the whole
 * migration runner into the bundle.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
