import type { Env } from "../config/index.ts";
import type { Logger } from "../observability/logger.ts";

export type StorageBody = string | Uint8Array | ArrayBuffer | ArrayBufferView | Blob;

export type StoragePutOptions = {
  contentType?: string;
  cacheControl?: string;
  acl?: "private" | "public-read";
};

export type StorageObject = {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
};

export type StorageUrlOptions = { expiresInSeconds?: number };

/** One object store. `get` returns bytes so the same call works on Bun, Workers, and tests. */
export type StorageDriver = {
  readonly name: string;
  put(key: string, body: StorageBody, options?: StoragePutOptions): Promise<StorageObject>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  /** A public or presigned URL; local returns a path under STORAGE_PUBLIC_URL. */
  url(key: string, options?: StorageUrlOptions): Promise<string>;
};

export type StorageDriverContext = {
  env: Env;
  logger: Logger;
  /** Cloudflare bindings (for the R2 driver); absent on Bun. */
  bindings?: Record<string, unknown>;
};

export type StorageDriverFactory = (context: StorageDriverContext) => StorageDriver;

/** The helper features call: the driver plus JSON conveniences. */
export type Storage = StorageDriver & {
  putJson<T>(key: string, value: T, options?: StoragePutOptions): Promise<StorageObject>;
  getJson<T>(key: string): Promise<T | undefined>;
};
