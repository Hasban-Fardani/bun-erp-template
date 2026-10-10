import type { KeyValueAdapter } from "../utils/key-value.ts";

export type CapacitorSqliteOptions = {
  databaseName?: string;
  databaseVersion?: number;
  table?: string;
};

/**
 * Encrypted SQLite for native Capacitor builds. The driver is loaded from `@capacitor-community/sqlite`
 * only when this function runs, so a web bundle that never imports `@loom/storage/capacitor`
 * stays free of the native plugin.
 */
export async function createCapacitorSqliteAdapter(options: CapacitorSqliteOptions = {}): Promise<KeyValueAdapter> {
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const databaseName = options.databaseName ?? "loom_offline";
  const databaseVersion = options.databaseVersion ?? 1;
  const table = options.table ?? "records";
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  const consistency = await sqlite.checkConnectionsConsistency();
  if (!consistency.result) await sqlite.closeAllConnections();
  const secret = await sqlite.isSecretStored();
  if (!secret.result) await sqlite.setEncryptionSecret(crypto.randomUUID());
  const existing = await sqlite.isConnection(databaseName, false);
  const database = existing.result
    ? await sqlite.retrieveConnection(databaseName, false)
    : await sqlite.createConnection(databaseName, true, "secret", databaseVersion, false);
  await database.open();
  await database.execute(`
    create table if not exists ${table} (
      namespace text not null,
      record_key text not null,
      value text not null,
      updated_at text not null,
      primary key (namespace, record_key)
    )
  `);

  return {
    async get(namespace, key) {
      const result = await database.query(
        `select value, updated_at as updatedAt from ${table} where namespace = ? and record_key = ? limit 1`,
        [namespace, key],
      );
      const row = result.values?.[0] as { value?: string; updatedAt?: string } | undefined;
      return row?.value && row.updatedAt ? { value: row.value, updatedAt: row.updatedAt } : undefined;
    },
    async put(namespace, key, value, updatedAt) {
      await database.run(
        `insert into ${table} (namespace, record_key, value, updated_at) values (?, ?, ?, ?)
         on conflict (namespace, record_key) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [namespace, key, value, updatedAt],
      );
    },
    async list(namespace) {
      const result = await database.query(
        `select record_key as key, value, updated_at as updatedAt from ${table} where namespace = ? order by updated_at desc`,
        [namespace],
      );
      return (result.values ?? []) as Array<{ key: string; value: string; updatedAt: string }>;
    },
    async delete(namespace, key) {
      await database.run(`delete from ${table} where namespace = ? and record_key = ?`, [namespace, key]);
    },
    async clear(namespace) {
      await database.run(`delete from ${table} where namespace = ?`, [namespace]);
    },
  };
}
