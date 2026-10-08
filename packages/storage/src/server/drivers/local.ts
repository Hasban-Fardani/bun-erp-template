import { contentTypeFor, storageKey, toBytes } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/**
 * Filesystem driver for Bun development and tests. Production refuses it (the app's config
 * schema), and Workers cannot select it, so a missing Bun runtime fails loudly.
 */
export const localStorageDriver: StorageDriverFactory = ({ config }): StorageDriver => {
  if (typeof Bun === "undefined" || typeof Bun.file !== "function") {
    throw new Error("local storage needs the Bun runtime; use the s3 or r2 driver on Cloudflare");
  }
  const root = (config.localRoot ?? ".data/storage").replace(/\/+$/, "");
  const base = (config.publicUrl ?? "").replace(/\/+$/, "");
  const pathFor = (key: string) => `${root}/${key}`;

  return {
    name: "local",
    async put(key, body, options: StoragePutOptions = {}): Promise<StorageObject> {
      const safe = storageKey(key);
      const bytes = await toBytes(body);
      await Bun.write(pathFor(safe), bytes);
      return { key: safe, size: bytes.byteLength, contentType: contentTypeFor(safe, options.contentType) };
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
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const keys: string[] = [];
      try {
        for await (const path of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
          if (path.startsWith(prefix)) keys.push(path);
        }
      } catch (error) {
        // A root nothing was written to yet is an empty store, not a failure.
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
      keys.sort();
      const start = cursor ? keys.findIndex((key) => key > cursor) : 0;
      const slice = start === -1 ? [] : keys.slice(start, start + limit);
      const last = slice.at(-1);
      const more = last !== undefined && keys.indexOf(last) < keys.length - 1;
      return {
        objects: slice.map((key) => ({ key, size: Bun.file(pathFor(key)).size })),
        cursor: more ? last : undefined,
      };
    },
    async url(key: string): Promise<string> {
      const safe = storageKey(key);
      return base ? `${base}/${safe}` : `/${safe}`;
    },
  };
};
