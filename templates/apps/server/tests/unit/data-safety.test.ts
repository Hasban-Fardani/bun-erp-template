import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { testDatabaseUrl } from "../../config/index.ts";
import { nextNumber, sequences } from "../../database/numbering.ts";
import { bumpVersion, version, versionGuard } from "../../database/optimistic-locking.ts";
import { createPostgresDatabase } from "../../database/postgres.ts";
import { forceDeleteRow, notDeleted, restoreRow, softDelete, softDeleteRow } from "../../database/soft-delete.ts";
import { createSeededApp, type SeededApp } from "../support/fixtures.ts";

/**
 * Probe table: the helpers are generic over any soft-deletable, versioned table, so they are
 * exercised here without a business module. The DDL mirrors what `make:feature` emits.
 */
const probe = pgTable("data_safety_probe", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  label: text("label").notNull(),
  deletedAt: softDelete(),
  version: version(),
});

let fixture: SeededApp;

/** Every data-safety test starts from the same live probe row. */
async function insertProbe(label: string) {
  const [row] = await fixture.ctx.db.insert(probe).values({ label }).returning();
  if (!row) throw new Error("probe insert returned no row");
  return row;
}

beforeEach(async () => {
  fixture = await createSeededApp();
  await fixture.ctx.db.execute(sql`
    create table if not exists data_safety_probe (
      id uuid primary key default uuidv7(),
      label text not null,
      deleted_at timestamptz,
      version integer not null default 0
    )
  `);
}, 30_000);

describe("soft delete", () => {
  test("notDeleted hides deleted rows and restore brings them back", async () => {
    const db = fixture.ctx.db;
    const row = await insertProbe("keuangan");
    expect(row.deletedAt).toBeNull();
    expect(row.version).toBe(0);

    const removed = await softDeleteRow(db, probe, row.id);
    expect(removed?.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(probe).where(notDeleted(probe))).toHaveLength(0);
    expect(await db.select().from(probe)).toHaveLength(1);
    expect(await softDeleteRow(db, probe, row.id)).toBeUndefined();

    const restored = await restoreRow(db, probe, row.id);
    expect(restored?.deletedAt).toBeNull();
    expect(await db.select().from(probe).where(notDeleted(probe))).toHaveLength(1);
  });

  test("forceDeleteRow removes a soft-deleted row permanently", async () => {
    const db = fixture.ctx.db;
    const row = await insertProbe("gudang");
    await softDeleteRow(db, probe, row.id);

    const removed = await forceDeleteRow(db, probe, row.id);
    expect(removed?.id).toBe(row.id);
    expect(await db.select().from(probe)).toHaveLength(0);
    expect(await forceDeleteRow(db, probe, row.id)).toBeUndefined();
  });
});

describe("optimistic locking", () => {
  test("bumpVersion and versionGuard update only the expected version", async () => {
    const db = fixture.ctx.db;
    const row = await insertProbe("awal");
    const id = row.id;

    const updated = await db
      .update(probe)
      .set({ label: "ubah", version: bumpVersion(probe) })
      .where(versionGuard(probe, id, 0))
      .returning();
    expect(updated[0]?.version).toBe(1);

    const stale = await db
      .update(probe)
      .set({ label: "stale", version: bumpVersion(probe) })
      .where(versionGuard(probe, id, 0))
      .returning();
    expect(stale).toHaveLength(0);

    const [after] = await db.select().from(probe).where(eq(probe.id, id));
    expect(after?.label).toBe("ubah");
    expect(after?.version).toBe(1);
  });
});

describe("numbering", () => {
  test("nextNumber formats prefix and padding and never skips a value", async () => {
    const db = fixture.ctx.db;
    const first = await nextNumber(db, "sales-order", { prefix: "SO-", padding: 4 });
    const second = await nextNumber(db, "sales-order");
    const third = await nextNumber(db, "sales-order");
    expect([first, second, third]).toEqual(["SO-0001", "SO-0002", "SO-0003"]);

    const [sequence] = await db.select().from(sequences).where(eq(sequences.key, "sales-order"));
    expect(sequence).toMatchObject({ prefix: "SO-", padding: 4, next: 4 });
  });

  test("concurrent nextNumber calls allocate every value exactly once", async () => {
    const url = testDatabaseUrl();
    if (!url) throw new Error("TEST_DATABASE_URL is required");
    // The shared fixture pool is one connection; a second pool gives the row lock real contention.
    const pool = createPostgresDatabase(url, 5);
    try {
      const count = 20;
      const allocated = await Promise.all(
        Array.from({ length: count }, () =>
          pool.db.transaction((tx) => nextNumber(tx, "concurrent-order", { prefix: "#", padding: 3 })),
        ),
      );
      expect(new Set(allocated).size).toBe(count);
      expect(allocated.map((value) => Number(value.slice(1))).sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      );
    } finally {
      await pool.close();
    }
  });
});
