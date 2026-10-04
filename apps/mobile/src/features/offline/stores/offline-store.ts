import { createUuid } from "@bun-erp/utils";
import { Capacitor } from "@capacitor/core";

const DATABASE_NAME = "bun_erp_offline";
const DATABASE_VERSION = 1;
const OBJECT_STORE = "records";

export type OfflineRecord<T> = { key: string; value: T; updatedAt: string };

export interface OfflineAdapter {
  get(namespace: string, key: string): Promise<{ value: string; updatedAt: string } | undefined>;
  put(namespace: string, key: string, value: string, updatedAt: string): Promise<void>;
  list(namespace: string): Promise<Array<{ key: string; value: string; updatedAt: string }>>;
  delete(namespace: string, key: string): Promise<void>;
  clear(namespace: string): Promise<void>;
}

/** JSON records are namespaced so features cannot overwrite each other's offline data. */
export function createOfflineStore(adapter: OfflineAdapter) {
  return {
    async get<T>(namespace: string, key: string): Promise<OfflineRecord<T> | undefined> {
      const record = await adapter.get(requireName(namespace, "namespace"), requireName(key, "key"));
      return record ? { key, value: JSON.parse(record.value) as T, updatedAt: record.updatedAt } : undefined;
    },
    async put<T>(namespace: string, key: string, value: T): Promise<OfflineRecord<T>> {
      const safeNamespace = requireName(namespace, "namespace");
      const safeKey = requireName(key, "key");
      const record = { key: safeKey, value, updatedAt: new Date().toISOString() };
      await adapter.put(safeNamespace, safeKey, JSON.stringify(value), record.updatedAt);
      return record;
    },
    async list<T>(namespace: string): Promise<OfflineRecord<T>[]> {
      const records = await adapter.list(requireName(namespace, "namespace"));
      return records.map((record) => ({
        key: record.key,
        value: JSON.parse(record.value) as T,
        updatedAt: record.updatedAt,
      }));
    },
    async delete(namespace: string, key: string): Promise<void> {
      await adapter.delete(requireName(namespace, "namespace"), requireName(key, "key"));
    },
    async clear(namespace: string): Promise<void> {
      await adapter.clear(requireName(namespace, "namespace"));
    },
  };
}

let defaultStore: ReturnType<typeof createOfflineStore> | undefined;
let defaultStorePromise: Promise<ReturnType<typeof createOfflineStore>> | undefined;

/** Native builds use encrypted SQLite; browser development uses IndexedDB. */
export async function getOfflineStore(): Promise<ReturnType<typeof createOfflineStore>> {
  if (defaultStore) return defaultStore;
  defaultStorePromise ??= (async () => {
    const adapter = Capacitor.isNativePlatform() ? await createNativeAdapter() : await createIndexedDbAdapter();
    return createOfflineStore(adapter);
  })();
  try {
    defaultStore = await defaultStorePromise;
    return defaultStore;
  } catch (error) {
    defaultStorePromise = undefined;
    throw error;
  }
}

function requireName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new RangeError(`${label} must contain 1–200 characters`);
  return normalized;
}

async function createNativeAdapter(): Promise<OfflineAdapter> {
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistency = await sqlite.checkConnectionsConsistency();
  if (!consistency.result) await sqlite.closeAllConnections();
  const secret = await sqlite.isSecretStored();
  if (!secret.result) await sqlite.setEncryptionSecret(createUuid());
  const existing = await sqlite.isConnection(DATABASE_NAME, false);
  const database = existing.result
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, true, "secret", DATABASE_VERSION, false);
  await database.open();
  await database.execute(`
    create table if not exists ${OBJECT_STORE} (
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
        `select value, updated_at as updatedAt from ${OBJECT_STORE} where namespace = ? and record_key = ? limit 1`,
        [namespace, key],
      );
      const row = result.values?.[0] as { value?: string; updatedAt?: string } | undefined;
      return row?.value && row.updatedAt ? { value: row.value, updatedAt: row.updatedAt } : undefined;
    },
    async put(namespace, key, value, updatedAt) {
      await database.run(
        `insert into ${OBJECT_STORE} (namespace, record_key, value, updated_at) values (?, ?, ?, ?)
         on conflict (namespace, record_key) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [namespace, key, value, updatedAt],
      );
    },
    async list(namespace) {
      const result = await database.query(
        `select record_key as key, value, updated_at as updatedAt from ${OBJECT_STORE} where namespace = ? order by updated_at desc`,
        [namespace],
      );
      return (result.values ?? []) as Array<{ key: string; value: string; updatedAt: string }>;
    },
    async delete(namespace, key) {
      await database.run(`delete from ${OBJECT_STORE} where namespace = ? and record_key = ?`, [namespace, key]);
    },
    async clear(namespace) {
      await database.run(`delete from ${OBJECT_STORE} where namespace = ?`, [namespace]);
    },
  };
}

async function createIndexedDbAdapter(): Promise<OfflineAdapter> {
  const database = await openIndexedDb();
  return {
    async get(namespace, key) {
      const record = await requestValue(
        database.transaction(OBJECT_STORE, "readonly").objectStore(OBJECT_STORE).get(indexedKey(namespace, key)),
      );
      return record ? { value: record.value, updatedAt: record.updatedAt } : undefined;
    },
    async put(namespace, key, value, updatedAt) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      transaction.objectStore(OBJECT_STORE).put({ id: indexedKey(namespace, key), namespace, key, value, updatedAt });
      await transactionDone(transaction);
    },
    async list(namespace) {
      const transaction = database.transaction(OBJECT_STORE, "readonly");
      const rows = await requestValue(transaction.objectStore(OBJECT_STORE).index("namespace").getAll(namespace));
      return rows
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(({ key, value, updatedAt }) => ({ key, value, updatedAt }));
    },
    async delete(namespace, key) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      transaction.objectStore(OBJECT_STORE).delete(indexedKey(namespace, key));
      await transactionDone(transaction);
    },
    async clear(namespace) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      const request = transaction.objectStore(OBJECT_STORE).index("namespace").openCursor(IDBKeyRange.only(namespace));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await transactionDone(transaction);
    },
  };
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(OBJECT_STORE, { keyPath: "id" });
      store.createIndex("namespace", "namespace", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local offline storage"));
  });
}

function indexedKey(namespace: string, key: string): string {
  return `${encodeURIComponent(namespace)}\u001f${encodeURIComponent(key)}`;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage transaction was aborted"));
  });
}
