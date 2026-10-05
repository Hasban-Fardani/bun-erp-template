export { createIndexedDbAdapter, createLocalStorageAdapter, type StringStorage } from "./browser/index.ts";
export { type DefaultStoreOptions, getDefaultKeyValueStore } from "./default.ts";
export { createKeyValueStore, type KeyValueAdapter, type KeyValueStore, type StoredRecord } from "./key-value.ts";
export { createMemoryAdapter } from "./memory.ts";
