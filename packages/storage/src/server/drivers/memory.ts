import { prepareObject, storageKey } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/** In-memory objects for tests and for a driver-agnostic boot. */
export function createMemoryStorageDriver(): StorageDriver & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    name: "memory",
    objects,
    async put(key, body, options: StoragePutOptions = {}): Promise<StorageObject> {
      const { key: safe, bytes, contentType } = await prepareObject(key, body, options.contentType);
      objects.set(safe, bytes);
      return { key: safe, size: bytes.byteLength, contentType };
    },
    async get(key) {
      return objects.get(storageKey(key));
    },
    async delete(key) {
      return objects.delete(storageKey(key));
    },
    async exists(key) {
      return objects.has(storageKey(key));
    },
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor ? keys.findIndex((key) => key > cursor) : 0;
      const slice = start === -1 ? [] : keys.slice(start, start + limit);
      const last = slice.at(-1);
      const more = last !== undefined && keys.indexOf(last) < keys.length - 1;
      return {
        objects: slice.map((key) => ({ key, size: objects.get(key)?.byteLength ?? 0 })),
        cursor: more ? last : undefined,
      };
    },
    async url(key) {
      return `memory://${storageKey(key)}`;
    },
  };
}

export const memoryStorageDriver: StorageDriverFactory = () => createMemoryStorageDriver();
