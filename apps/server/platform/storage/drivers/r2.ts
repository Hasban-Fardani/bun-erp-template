import { prepareObject, storageKey } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/** The subset of the Cloudflare R2 bucket binding this driver uses. */
type R2ObjectBody = {
  size: number;
  httpEtag?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};
type R2Bucket = {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<{ size: number; httpEtag?: string } | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number; httpEtag?: string } | null>;
  delete(key: string): Promise<void>;
};

/**
 * Cloudflare R2 through the Worker binding. The binding name is STORAGE_R2_BINDING and the public
 * URL comes from STORAGE_PUBLIC_URL; R2 bindings cannot presign, so an unset base URL is an error.
 */
export const r2StorageDriver: StorageDriverFactory = ({ env, bindings }): StorageDriver => {
  const binding = bindings?.[env.STORAGE_R2_BINDING];
  if (!binding || typeof (binding as R2Bucket).get !== "function") {
    throw new Error(
      `R2 binding "${env.STORAGE_R2_BINDING}" is not available; add it to the Worker bindings or pick another STORAGE_DRIVER`,
    );
  }
  const bucket = binding as R2Bucket;
  const base = env.STORAGE_PUBLIC_URL.replace(/\/+$/, "");
  if (base === "") throw new Error("STORAGE_PUBLIC_URL is required when STORAGE_DRIVER=r2");

  return {
    name: "r2",
    async put(key, body, options: StoragePutOptions = {}): Promise<StorageObject> {
      const { key: safe, bytes, contentType } = await prepareObject(key, body, options.contentType);
      const result = await bucket.put(safe, bytes, {
        httpMetadata: { contentType, cacheControl: options.cacheControl },
      });
      return { key: safe, size: result?.size ?? bytes.byteLength, contentType, etag: result?.httpEtag };
    },
    async get(key: string): Promise<Uint8Array | undefined> {
      const object = await bucket.get(storageKey(key));
      if (!object) return undefined;
      return new Uint8Array(await object.arrayBuffer());
    },
    async delete(key: string): Promise<boolean> {
      const safe = storageKey(key);
      if (!(await bucket.head(safe))) return false;
      await bucket.delete(safe);
      return true;
    },
    async exists(key: string): Promise<boolean> {
      return (await bucket.head(storageKey(key))) !== null;
    },
    async url(key: string): Promise<string> {
      return `${base}/${storageKey(key)}`;
    },
  };
};
