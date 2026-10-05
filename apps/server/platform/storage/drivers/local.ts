import { prepareObject, storageKey } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/**
 * Filesystem driver for Bun development and tests. Production refuses it (config schema), and
 * Workers cannot select it, so a missing Bun runtime fails loudly instead of writing nowhere.
 */
export const localStorageDriver: StorageDriverFactory = ({ env }): StorageDriver => {
  if (typeof Bun === "undefined" || typeof Bun.file !== "function") {
    throw new Error("local storage needs the Bun runtime; use STORAGE_DRIVER=s3 or r2 on Cloudflare");
  }
  const root = env.STORAGE_LOCAL_ROOT.replace(/\/+$/, "");
  const base = env.STORAGE_PUBLIC_URL.replace(/\/+$/, "");
  const pathFor = (key: string) => `${root}/${key}`;

  return {
    name: "local",
    async put(key, body, options: StoragePutOptions = {}): Promise<StorageObject> {
      const { key: safe, bytes, contentType } = await prepareObject(key, body, options.contentType);
      await Bun.write(pathFor(safe), bytes);
      return { key: safe, size: bytes.byteLength, contentType };
    },
    async get(key: string): Promise<Uint8Array | undefined> {
      const file = Bun.file(pathFor(storageKey(key)));
      if (!(await file.exists())) return undefined;
      return new Uint8Array(await file.arrayBuffer());
    },
    async delete(key: string): Promise<boolean> {
      const file = Bun.file(pathFor(storageKey(key)));
      if (!(await file.exists())) return false;
      await file.delete();
      return true;
    },
    async exists(key: string): Promise<boolean> {
      return Bun.file(pathFor(storageKey(key))).exists();
    },
    async url(key: string): Promise<string> {
      const safe = storageKey(key);
      return base ? `${base}/${safe}` : `/${safe}`;
    },
  };
};
