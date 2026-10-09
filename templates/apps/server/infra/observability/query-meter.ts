/**
 * Counts the SQL statements sent to PostgreSQL (Laravel's `DB::listen`, reduced to what production
 * can afford). On Workers the context is built per request, so the count is exact per request;
 * on a long-lived Bun process concurrent requests share it, so a per-request delta is an upper bound.
 * Only a bounded sample of recent statement text is kept, for diagnostics and tests, never logged.
 */
const SAMPLE_SIZE = 20;

export type QueryMeter = {
  record: (sql: string) => void;
  count: () => number;
  /** The most recent statements, whitespace-collapsed and truncated. */
  sample: () => string[];
};

export function createQueryMeter(): QueryMeter {
  let total = 0;
  const recent: string[] = [];
  return {
    record(sql) {
      total += 1;
      recent.push(sql.replace(/\s+/g, " ").trim().slice(0, 140));
      if (recent.length > SAMPLE_SIZE) recent.shift();
    },
    count: () => total,
    sample: () => [...recent],
  };
}
