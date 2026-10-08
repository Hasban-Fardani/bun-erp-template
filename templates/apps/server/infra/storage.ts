import { createObjectStorage, type ObjectStorage, type ServerStorageConfig } from "@bun-erp/storage/server";
import type { Env } from "../config/index.ts";

/** Server object store, aliased so features and the composition root share one name. */
export type Storage = ObjectStorage;

export type CreateStorageOptions = {
  env: Env;
  /** Cloudflare bindings, when the r2 driver is selected. */
  bindings?: Record<string, unknown>;
};

/** Maps the validated server environment onto the platform-neutral storage config. */
export function createStorage(options: CreateStorageOptions): Storage {
  const { env } = options;
  const config: ServerStorageConfig = {
    driver: env.STORAGE_DRIVER,
    localRoot: env.STORAGE_LOCAL_ROOT,
    publicUrl: env.STORAGE_PUBLIC_URL,
    r2Binding: env.STORAGE_R2_BINDING,
    s3: {
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
  };
  return createObjectStorage({ config, bindings: options.bindings });
}

/**
 * Reads a storage config from raw environment variables under a prefix: `SOURCE_` reads
 * `SOURCE_STORAGE_DRIVER`, `SOURCE_S3_BUCKET` and so on; an empty prefix reads the live
 * `STORAGE_*` / `S3_*` keys. Used by `storage:copy`, which needs two stores at once, so it cannot
 * rely on the single validated `Env`.
 */
export function storageConfigFromEnv(source: Record<string, string | undefined>, prefix: string): ServerStorageConfig {
  const read = (key: string, fallback = "") => source[`${prefix}${key}`] ?? fallback;
  const driver = read("STORAGE_DRIVER");
  if (!driver) throw new Error(`${prefix}STORAGE_DRIVER is not set; it selects the store for this side of the copy.`);
  return {
    driver,
    localRoot: read("STORAGE_LOCAL_ROOT", ".data/storage"),
    publicUrl: read("STORAGE_PUBLIC_URL"),
    r2Binding: read("STORAGE_R2_BINDING", "STORAGE"),
    s3: {
      bucket: read("S3_BUCKET"),
      region: read("S3_REGION", "auto"),
      endpoint: read("S3_ENDPOINT"),
      accessKeyId: read("S3_ACCESS_KEY_ID"),
      secretAccessKey: read("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: read("S3_FORCE_PATH_STYLE") === "true",
    },
  };
}

export type { ObjectStorage } from "@bun-erp/storage/server";
