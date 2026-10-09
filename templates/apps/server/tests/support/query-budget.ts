/**
 * Query budgets: count the SQL statements a unit of work sends to PostgreSQL.
 *
 * On Cloudflare Workers Free every statement spends Hyperdrive's 100k/day quota and adds a round trip
 * to the CPU-limited request, so a route's statement count is a tested number, not a guess. Counting
 * is a postgres.js `debug` hook, which sees the exact text of every statement on every code path
 * (Drizzle, Better Auth's adapter, raw `sql`).
 */
let recorder: string[] | undefined;

/** Wired into the shared test context; a no-op unless `countQueries` is running. */
export function recordQuery(sql: string): void {
  recorder?.push(sql);
}

export type QueryReport = { count: number; statements: string[] };

/** Runs `work` and returns every statement it sent, collapsed to a one-line preview. */
export async function countQueries(work: () => Promise<unknown>): Promise<QueryReport> {
  if (recorder) throw new Error("countQueries cannot be nested");
  const seen: string[] = [];
  recorder = seen;
  try {
    await work();
  } finally {
    recorder = undefined;
  }
  const statements = seen.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 140));
  return { count: statements.length, statements };
}
