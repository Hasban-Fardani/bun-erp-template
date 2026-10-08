import { prepareObject, storageKey } from "../key.ts";
import type { StorageDriver, StorageDriverFactory, StorageObject, StoragePutOptions } from "../types.ts";

/**
 * S3-compatible objects through Bun.S3Client, so no AWS SDK is bundled. On Cloudflare the same
 * endpoint is reached with the R2 binding driver instead, because Workers have no Bun client.
 */
export const s3StorageDriver: StorageDriverFactory = ({ config }): StorageDriver => {
  if (typeof Bun === "undefined" || typeof Bun.S3Client !== "function") {
    throw new Error("s3 storage needs the Bun runtime (Bun.S3Client); use the r2 driver on Cloudflare");
  }
  const s3 = config.s3;
  if (!s3 || s3.bucket === "") {
    throw new Error("an S3 bucket is required when driver=s3");
  }
  const client = new Bun.S3Client({
    bucket: s3.bucket,
    region: s3.region,
    endpoint: s3.endpoint || undefined,
    accessKeyId: s3.accessKeyId || undefined,
    secretAccessKey: s3.secretAccessKey || undefined,
    virtualHostedStyle: !s3.forcePathStyle,
  });
  const base = (config.publicUrl ?? "").replace(/\/+$/, "");

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
    async list({ prefix, cursor, limit } = {}) {
      const result = await client.list({
        prefix: prefix || undefined,
        continuationToken: cursor,
        maxKeys: limit,
      });
      return {
        objects: (result.contents ?? []).map((entry) => ({ key: entry.key, size: entry.size ?? 0 })),
        cursor: result.isTruncated ? result.nextContinuationToken : undefined,
      };
    },
    async url(key: string, options): Promise<string> {
      const safe = storageKey(key);
      if (base !== "" && options?.expiresInSeconds === undefined) return `${base}/${safe}`;
      return client.presign(safe, { expiresIn: options?.expiresInSeconds ?? 3600 });
    },
  };
};
