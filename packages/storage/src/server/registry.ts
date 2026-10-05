import { DriverRegistry } from "@bun-erp/utils";
import { localStorageDriver } from "./drivers/local.ts";
import { memoryStorageDriver } from "./drivers/memory.ts";
import { r2StorageDriver } from "./drivers/r2.ts";
import { s3StorageDriver } from "./drivers/s3.ts";
import type { StorageDriver, StorageDriverContext } from "./types.ts";

/**
 * The driver is selected by configuration so one codebase runs on a Bun filesystem (dev/test),
 * S3 from Bun, or an R2 binding on Cloudflare without changing feature code.
 */
export class StorageDriverRegistry extends DriverRegistry<StorageDriverContext, StorageDriver> {
  constructor() {
    super("storage driver");
  }
}

export function createStorageRegistry(): StorageDriverRegistry {
  return new StorageDriverRegistry()
    .register("local", localStorageDriver)
    .register("memory", memoryStorageDriver)
    .register("r2", r2StorageDriver)
    .register("s3", s3StorageDriver);
}

export type { StorageDriverContext, StorageDriverFactory } from "./types.ts";
