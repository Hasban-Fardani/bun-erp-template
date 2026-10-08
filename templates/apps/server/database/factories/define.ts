import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "../index.ts";

/** A database handle or a transaction: both expose `insert`, so factories work inside either. */
type Inserter = Pick<Database, "insert">;

export type Factory<TTable extends PgTable> = {
  /** Builds insert values without touching the database. Every call advances the sequence. */
  make(overrides?: Partial<TTable["$inferInsert"]>): TTable["$inferInsert"];
  /** Inserts one row and returns it, including database defaults such as `id`. */
  create(db: Inserter, overrides?: Partial<TTable["$inferInsert"]>): Promise<TTable["$inferSelect"]>;
  /** Inserts `count` rows in one statement. Overrides apply to every row. */
  createMany(
    db: Inserter,
    count: number,
    overrides?: Partial<TTable["$inferInsert"]>,
  ): Promise<TTable["$inferSelect"][]>;
  /** Restarts the sequence at 1; call it in `beforeEach` when a test asserts on generated values. */
  reset(): void;
};

/**
 * Defines a table factory. `values(n)` receives a per-factory sequence starting at 1, so generated
 * data is deterministic and unique within a run without a faker dependency. Overrides always win.
 */
export function defineFactory<TTable extends PgTable>(
  table: TTable,
  values: (sequence: number) => TTable["$inferInsert"],
): Factory<TTable> {
  let sequence = 0;
  const make = (overrides: Partial<TTable["$inferInsert"]> = {}): TTable["$inferInsert"] => {
    sequence += 1;
    return { ...values(sequence), ...overrides };
  };
  return {
    make,
    async create(db, overrides) {
      const rows = await db.insert(table).values(make(overrides)).returning();
      const row = rows[0];
      if (!row) throw new Error("Factory insert returned no row");
      return row as TTable["$inferSelect"];
    },
    async createMany(db, count, overrides) {
      if (!Number.isInteger(count) || count < 0) throw new Error("Factory count must be a non-negative integer");
      if (count === 0) return [];
      const batch = Array.from({ length: count }, () => make(overrides));
      return (await db.insert(table).values(batch).returning()) as TTable["$inferSelect"][];
    },
    reset() {
      sequence = 0;
    },
  };
}
