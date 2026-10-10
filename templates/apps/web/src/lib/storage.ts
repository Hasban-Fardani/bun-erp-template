import { createKeyValueStore, getDefaultKeyValueStore, type KeyValueAdapter, type KeyValueStore } from "@loom/storage";

let store: Promise<KeyValueStore> | undefined;

/**
 * Browser-local cache shared across screens. IndexedDB by default; pass an adapter to inject a
 * test backend (the first call wins, so the app resolves one store for its lifetime).
 */
export function webStore(adapter?: KeyValueAdapter): Promise<KeyValueStore> {
  if (!store) {
    store = adapter ? Promise.resolve(createKeyValueStore(adapter)) : getDefaultKeyValueStore();
  }
  return store;
}
