import { createIndexedDbAdapter } from "./browser/indexed-db.ts";
import { createLocalStorageAdapter, type StringStorage } from "./browser/local-storage.ts";
import { createKeyValueStore, type KeyValueAdapter, type KeyValueStore } from "./key-value.ts";
import { createMemoryAdapter } from "./memory.ts";

export type DefaultStoreOptions = {
  databaseName?: string;
  /**
   * Native adapter factory. The app injects it because encrypted SQLite lives in the app's
   * Capacitor dependency (imported from `@bun-erp/storage/mobile`), not in the core.
   */
  native?: () => Promise<KeyValueAdapter>;
};

function isNativePlatform(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

/**
 * One resolver for web and mobile: native SQLite when injected, IndexedDB in a browser, then
 * localStorage, then in-memory. Feature code never picks the backend.
 */
export async function getDefaultKeyValueStore(options: DefaultStoreOptions = {}): Promise<KeyValueStore> {
  if (isNativePlatform() && options.native) {
    return createKeyValueStore(await options.native());
  }
  if (typeof indexedDB !== "undefined") {
    return createKeyValueStore(await createIndexedDbAdapter(options.databaseName));
  }
  const localStorage = (globalThis as { localStorage?: StringStorage }).localStorage;
  if (localStorage) {
    return createKeyValueStore(createLocalStorageAdapter(localStorage, options.databaseName ?? "bun-erp"));
  }
  return createKeyValueStore(createMemoryAdapter());
}
