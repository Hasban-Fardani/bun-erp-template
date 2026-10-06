import { createKeyValueStore, getDefaultKeyValueStore, type KeyValueAdapter } from "@bun-erp/storage";
import { createCapacitorSqliteAdapter } from "@bun-erp/storage/capacitor";

const DATABASE_NAME = "bun_erp_offline";

export type OfflineAdapter = KeyValueAdapter;

/** The shared key/value store; native builds inject encrypted SQLite, browsers use IndexedDB. */
export { createKeyValueStore as createOfflineStore };

let defaultStore: ReturnType<typeof createKeyValueStore> | undefined;
let defaultStorePromise: Promise<ReturnType<typeof createKeyValueStore>> | undefined;

export async function getOfflineStore(): Promise<ReturnType<typeof createKeyValueStore>> {
  if (defaultStore) return defaultStore;
  defaultStorePromise ??= getDefaultKeyValueStore({
    databaseName: DATABASE_NAME,
    native: () => createCapacitorSqliteAdapter({ databaseName: DATABASE_NAME }),
  });
  try {
    defaultStore = await defaultStorePromise;
    return defaultStore;
  } catch (error) {
    defaultStorePromise = undefined;
    throw error;
  }
}
