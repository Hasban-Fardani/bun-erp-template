import type { KeyValueAdapter } from "../utils/key-value.ts";

/** The synchronous string storage the Web Storage API exposes. */
export type StringStorage = {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
};

type Entry = { value: string; updatedAt: string };

/**
 * localStorage stores strings only, so records are JSON-packaged. Small data only: the whole
 * namespace is rewritten on `clear`, and the browser quota is a few megabytes.
 */
export function createLocalStorageAdapter(backend: StringStorage, prefix = "loom"): KeyValueAdapter {
  const id = (namespace: string, key: string) =>
    `${prefix}:${encodeURIComponent(namespace)}:${encodeURIComponent(key)}`;
  const read = (storageKey: string): Entry | undefined => {
    const raw = backend.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Entry) : undefined;
  };
  const listKeys = (namespace: string): string[] => {
    const marker = `${prefix}:${encodeURIComponent(namespace)}:`;
    const keys: string[] = [];
    for (let index = 0; index < backend.length; index += 1) {
      const storageKey = backend.key(index);
      if (storageKey?.startsWith(marker)) keys.push(storageKey);
    }
    return keys;
  };

  return {
    async get(namespace, key) {
      return read(id(namespace, key));
    },
    async put(namespace, key, value, updatedAt) {
      backend.setItem(id(namespace, key), JSON.stringify({ value, updatedAt }));
    },
    async list(namespace) {
      const marker = `${prefix}:${encodeURIComponent(namespace)}:`;
      return listKeys(namespace).map((storageKey) => {
        const entry = read(storageKey) ?? { value: "", updatedAt: "" };
        return { key: decodeURIComponent(storageKey.slice(marker.length)), ...entry };
      });
    },
    async delete(namespace, key) {
      backend.removeItem(id(namespace, key));
    },
    async clear(namespace) {
      for (const storageKey of listKeys(namespace)) backend.removeItem(storageKey);
    },
  };
}
