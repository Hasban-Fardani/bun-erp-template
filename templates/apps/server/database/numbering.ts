import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Database } from "./index.ts";
import { rowsOf } from "./rows.ts";

/** One row per sequence key; `next` is the value the next caller receives. */
export const sequences = pgTable("sequences", {
  key: text("key").primaryKey(),
  prefix: text("prefix").notNull().default(""),
  padding: integer("padding").notNull().default(0),
  next: integer("next").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NextNumberOptions = { prefix?: string; padding?: number };

type SequenceRow = { prefix: string; padding: number; next: number };

/**
 * Allocates the next formatted value for `key` inside the caller's transaction. The first call
 * creates the row already advanced; later calls `select ... for update`, so concurrent callers
 * serialise per key and committed values stay unique and gap-less. A rollback releases its value.
 */
export async function nextNumber(
  tx: Pick<Database, "execute">,
  key: string,
  options: NextNumberOptions = {},
): Promise<string> {
  const inserted = rowsOf<SequenceRow>(
    await tx.execute(sql`
      insert into sequences (key, prefix, padding, next, updated_at)
      values (${key}, ${options.prefix ?? ""}, ${options.padding ?? 0}, 2, now())
      on conflict (key) do nothing
      returning prefix, padding, next
    `),
  );
  const created = inserted[0];
  if (created) return format(1, created.prefix, created.padding);

  const locked = rowsOf<SequenceRow>(
    await tx.execute(sql`select prefix, padding, next from sequences where key = ${key} for update`),
  );
  const row = locked[0];
  if (!row) throw new Error(`Sequence "${key}" was removed during allocation`);
  await tx.execute(sql`update sequences set next = next + 1, updated_at = now() where key = ${key}`);
  return format(row.next, options.prefix ?? row.prefix, options.padding ?? row.padding);
}

function format(value: number, prefix: string, padding: number): string {
  return `${prefix}${String(value).padStart(padding, "0")}`;
}
