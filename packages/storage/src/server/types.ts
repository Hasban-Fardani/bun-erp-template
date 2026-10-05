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
  /** A public or presigned URL; local returns a path under the configured public URL. */
  url(key: string, options?: StorageUrlOptions): Promise<string>;
};

export type S3Config = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

/** The platform-neutral configuration every server driver reads; the app maps its env onto this. */
export type ServerStorageConfig = {
  driver: string;
  localRoot?: string;
  publicUrl?: string;
  r2Binding?: string;
  s3?: S3Config;
};

export type StorageDriverContext = {
  config: ServerStorageConfig;
  /** Cloudflare bindings (for the R2 driver); absent on Bun. */
  bindings?: Record<string, unknown>;
};

export type StorageDriverFactory = (context: StorageDriverContext) => StorageDriver;

/** The helper features call: the driver plus JSON conveniences. */
export type ObjectStorage = StorageDriver & {
  putJson<T>(key: string, value: T, options?: StoragePutOptions): Promise<StorageObject>;
  getJson<T>(key: string): Promise<T | undefined>;
};
