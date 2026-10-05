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
    async url(key) {
      return `memory://${storageKey(key)}`;
    },
  };
}

export const memoryStorageDriver: StorageDriverFactory = () => createMemoryStorageDriver();
