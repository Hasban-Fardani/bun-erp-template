import { prepareObject, storageKey } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/**
 * S3-compatible objects through Bun.S3Client, so no AWS SDK is bundled. On Cloudflare the same
 * endpoint is reached with the R2 binding driver instead, because Workers have no Bun client.
 */
export const s3StorageDriver: StorageDriverFactory = ({ env }): StorageDriver => {
  if (typeof Bun === "undefined" || typeof Bun.S3Client !== "function") {
    throw new Error("s3 storage needs the Bun runtime (Bun.S3Client); use STORAGE_DRIVER=r2 on Cloudflare");
  }
  if (env.S3_BUCKET === "") {
    throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  }
  const client = new Bun.S3Client({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
    virtualHostedStyle: !env.S3_FORCE_PATH_STYLE,
  });
  const base = env.STORAGE_PUBLIC_URL.replace(/\/+$/, "");

  return {
    name: "s3",
    async put(key, body, options: StoragePutOptions = {}): Promise<StorageObject> {
      const { key: safe, bytes, contentType } = await prepareObject(key, body, options.contentType);
      await client.write(safe, bytes, { type: contentType, acl: options.acl });
      return { key: safe, size: bytes.byteLength, contentType };
    },
    async get(key: string): Promise<Uint8Array | undefined> {
      const file = client.file(storageKey(key));
      if (!(await file.exists())) return undefined;
      return new Uint8Array(await file.arrayBuffer());
    },
    async delete(key: string): Promise<boolean> {
      const safe = storageKey(key);
      if (!(await client.exists(safe))) return false;
      await client.delete(safe);
      return true;
    },
    async exists(key: string): Promise<boolean> {
      return client.exists(storageKey(key));
    },
    async url(key: string, options): Promise<string> {
      const safe = storageKey(key);
      if (base !== "" && options?.expiresInSeconds === undefined) return `${base}/${safe}`;
      return client.presign(safe, { expiresIn: options?.expiresInSeconds ?? 3600 });
    },
  };
};
