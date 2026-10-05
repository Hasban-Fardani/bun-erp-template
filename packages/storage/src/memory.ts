import type { KeyValueAdapter } from "./key-value.ts";

/** In-memory records: the seam tests assert against and the fallback when no platform store exists. */
export function createMemoryAdapter(): KeyValueAdapter {
  const records = new Map<string, { value: string; updatedAt: string }>();
  const id = (namespace: string, key: string) => `${namespace}\u001f${key}`;
  return {
    async get(namespace, key) {
      return records.get(id(namespace, key));
    },
    async put(namespace, key, value, updatedAt) {
      records.set(id(namespace, key), { value, updatedAt });
    },
    async list(namespace) {
      return [...records.entries()]
        .filter(([key]) => key.startsWith(`${namespace}\u001f`))
        .map(([key, record]) => ({ key: key.slice(namespace.length + 1), ...record }));
    },
    async delete(namespace, key) {
      records.delete(id(namespace, key));
    },
    async clear(namespace) {
      for (const key of records.keys()) if (key.startsWith(`${namespace}\u001f`)) records.delete(key);
    },
  };
}
