export type StoredRecord<T> = { key: string; value: T; updatedAt: string };

/** The storage backend seam. Web injects localStorage/IndexedDB; mobile injects encrypted SQLite. */
export interface KeyValueAdapter {
  get(namespace: string, key: string): Promise<{ value: string; updatedAt: string } | undefined>;
  put(namespace: string, key: string, value: string, updatedAt: string): Promise<void>;
  list(namespace: string): Promise<Array<{ key: string; value: string; updatedAt: string }>>;
  delete(namespace: string, key: string): Promise<void>;
  clear(namespace: string): Promise<void>;
}

export type KeyValueStore = ReturnType<typeof createKeyValueStore>;

function requireName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new RangeError(`${label} must contain 1–200 characters`);
  return normalized;
}

/** JSON records are namespaced so features cannot overwrite each other's local data. */
export function createKeyValueStore(adapter: KeyValueAdapter) {
  return {
    async get<T>(namespace: string, key: string): Promise<StoredRecord<T> | undefined> {
      const record = await adapter.get(requireName(namespace, "namespace"), requireName(key, "key"));
      return record ? { key, value: JSON.parse(record.value) as T, updatedAt: record.updatedAt } : undefined;
    },
    async put<T>(namespace: string, key: string, value: T): Promise<StoredRecord<T>> {
      const safeNamespace = requireName(namespace, "namespace");
      const safeKey = requireName(key, "key");
      const record = { key: safeKey, value, updatedAt: new Date().toISOString() };
      await adapter.put(safeNamespace, safeKey, JSON.stringify(value), record.updatedAt);
      return record;
    },
    async list<T>(namespace: string): Promise<StoredRecord<T>[]> {
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
