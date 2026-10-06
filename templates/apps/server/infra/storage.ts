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

export type { ObjectStorage } from "@bun-erp/storage/server";
