import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";
import { rowsOf } from "./rows.ts";

const MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** One app-wide advisory lock key: every replica serializes migration steps on it. */
const MIGRATION_LOCK_KEY = 2026100701;

/** A catalog file whose number is recorded in the ledger under a different stem. */
export type LedgerMismatch = { catalog: string; ledger: string };

export type MigrationPlan = {
  /** Catalog files whose full stem is already in the ledger. */
  applied: string[];
  /** Catalog files the ledger has not seen yet. */
  pending: string[];
  /** Same number, different stem: the live schema came from another catalog. */
  mismatches: LedgerMismatch[];
  /** Catalog numbers owned by more than one file; the catalog itself is broken. */
  duplicates: { number: string; files: string[] }[];
  /** Ledger rows with no catalog file under their number — history that predates the catalog. */
  ledgerOnly: string[];
};

/**
 * The ledger cannot be reconciled with the catalog: a number is recorded under one stem and
 * shipped under another. Applying the catalog file on top of an unknown schema is worse than
 * stopping, so `migrate()` refuses and points at the recovery commands.
 */
export class MigrationLedgerMismatch extends Error {
  constructor(mismatches: readonly LedgerMismatch[]) {
    const detail = mismatches.map(({ catalog, ledger }) => `ledger "${ledger}" vs catalog "${catalog}"`).join("; ");
    super(
      `Migration ledger mismatch: ${detail}. The database schema is out of date with the catalog. ` +
        "Run `bun erp db:status`, then `bun erp db:reset --force` on local data.",
    );
    this.name = "MigrationLedgerMismatch";
  }
}

/** Two files claim one number, so filename order would make the step order arbitrary. */
export class DuplicateMigrationNumber extends Error {
  constructor(duplicates: readonly { number: string; files: readonly string[] }[]) {
    const detail = duplicates.map(({ number, files }) => `${number}: ${files.join(", ")}`).join("; ");
    super(`Duplicate migration numbers in the catalog: ${detail}. Rename one file per number before migrating.`);
    this.name = "DuplicateMigrationNumber";
  }
}

/** Migration files in filename order. `.sql` history is compared by stem, never executed. */
export function listMigrationFiles(dir: string): string[] {
  return [...new Bun.Glob("*.ts").scanSync({ cwd: dir })].filter((file) => /^\d{4}_[a-z0-9_]+\.ts$/.test(file)).sort();
}

/**
 * Compare the ledger with the catalog by full file stem, ignoring the extension. The stem is the
 * step identity: `0006_x.sql` ≡ `0006_x.ts`, while `0003_auth.sql` and `0003_rbac.ts` are two
 * different steps that happen to share a number — the second one must not run on a schema the
 * first one built.
 */
export function planMigrations(ledgerNames: readonly string[], catalogFiles: readonly string[]): MigrationPlan {
  const byNumber = new Map<string, string[]>();
  for (const file of catalogFiles) {
    const key = file.slice(0, 4);
    byNumber.set(key, [...(byNumber.get(key) ?? []), file]);
  }
  const duplicates = [...byNumber]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => ({ number, files: [...files].sort() }));
  const duplicateNumbers = new Set(duplicates.map(({ number }) => number));

  const catalogByStem = new Map(catalogFiles.map((file) => [migrationId(file), file]));
  const ledgerStems = new Set(ledgerNames.map(migrationId));

  const mismatches: LedgerMismatch[] = [];
  const ledgerOnly: string[] = [];
  for (const name of ledgerNames) {
    const stem = migrationId(name);
    if (catalogByStem.has(stem)) continue;
    const number = stem.slice(0, 4);
    const sameNumber = byNumber.get(number);
    if (sameNumber === undefined) {
      ledgerOnly.push(name);
      continue;
    }
    if (duplicateNumbers.has(number)) continue; // Reported as a catalog defect, not per file.
    for (const catalog of sameNumber) mismatches.push({ catalog, ledger: name });
  }

  // The buckets shown by `db:status` are disjoint: an exact stem match is applied even when a
  // foreign ledger entry shares its number, and a mismatched file is never also reported pending.
  const mismatched = new Set(mismatches.map(({ catalog }) => catalog));
  const applied: string[] = [];
  const pending: string[] = [];
  for (const file of catalogFiles) {
    if (ledgerStems.has(migrationId(file))) applied.push(file);
    else if (!mismatched.has(file)) pending.push(file);
  }
  return { applied, pending, mismatches, duplicates, ledgerOnly };
}

/** TypeScript migrations execute in filename order and commit one complete step at a time. */
export async function migrate(db: Database, dir: string): Promise<string[]> {
  const files = listMigrationFiles(dir);
  const catalog = planMigrations([], files);
  if (catalog.duplicates.length > 0) throw new DuplicateMigrationNumber(catalog.duplicates);

  await db.execute(sql.raw(MIGRATIONS_TABLE));
  const rows = await db.execute<{ name: string }>(sql`select name from _migrations`);
  const plan = planMigrations(
    rowsOf<{ name: string }>(rows).map(({ name }) => name),
    files,
  );
  if (plan.mismatches.length > 0) throw new MigrationLedgerMismatch(plan.mismatches);

  const applied = new Set(plan.applied.map(migrationId));
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(migrationId(file))) continue;
    const migration = (await import(`${dir}/${file}`)) as { up?: (database: Database) => Promise<void> };
    if (typeof migration.up !== "function") throw new Error(`Migration ${file} must export up(database)`);
    const appliedNow = await db.transaction(async (tx) => {
      // Two replicas can boot together; the transaction-scoped lock serializes them and the ledger
      // is re-read inside it so the loser skips a step the winner just committed instead of replaying it.
      await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
      const ledger = rowsOf<{ name: string }>(await tx.execute<{ name: string }>(sql`select name from _migrations`));
      if (ledger.some(({ name }) => migrationId(name) === migrationId(file))) return false;
      await migration.up?.(tx);
      await tx.execute(sql`insert into _migrations (name) values (${file})`);
      return true;
    });
    if (appliedNow) ran.push(file);
  }
  return ran;
}

/**
 * The full filename stem is the step identity: a legacy `0001_probe.sql` still suppresses its
 * `0001_probe.ts` replacement, while a different stem under the same number never does.
 */
function migrationId(file: string): string {
  return file.replace(/\.(ts|sql)$/, "");
}
