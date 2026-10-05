import type { Env } from "../config/index.ts";
import type { Logger } from "../observability/logger.ts";
import { createStorageRegistry, type StorageDriverRegistry } from "./registry.ts";
import type { Storage, StorageDriver, StoragePutOptions } from "./types.ts";

export type CreateStorageOptions = {
  env: Env;
  logger: Logger;
  /** Cloudflare bindings, when the R2 driver is selected. */
  bindings?: Record<string, unknown>;
  /** Overrides the registry, e.g. to add a project driver or inject a memory driver in tests. */
  registry?: StorageDriverRegistry;
  driver?: StorageDriver;
};

/**
 * `ctx.storage` is the helper features use. The driver name is validated at bootstrap, but the
 * transport is built on first use: a Bun filesystem, S3 client, and Worker binding cannot all be
 * constructed on every runtime, so an unused driver must not crash startup.
 */
export function createStorage(options: CreateStorageOptions): Storage {
  const registry = options.registry ?? createStorageRegistry();
  const name = options.driver?.name ?? options.env.STORAGE_DRIVER;
  if (!options.driver && !registry.has(name)) {
    throw new Error(`Unknown storage driver "${name}". Registered: ${registry.names().join(", ") || "(none)"}`);
  }

  let resolved = options.driver;
  const driver = (): StorageDriver => {
    resolved ??= registry.create(name, {
      env: options.env,
      logger: options.logger,
      bindings: options.bindings,
    });
    return resolved;
  };

  return {
    name,
    async put(key, body, putOptions) {
      return driver().put(key, body, putOptions);
    },
    async get(key) {
      return driver().get(key);
    },
    async delete(key) {
      return driver().delete(key);
    },
    async exists(key) {
      return driver().exists(key);
    },
    async url(key, urlOptions) {
      return driver().url(key, urlOptions);
    },
    async putJson(key: string, value: unknown, putOptions: StoragePutOptions = {}) {
      return driver().put(key, JSON.stringify(value), { contentType: "application/json", ...putOptions });
    },
    async getJson<T>(key: string): Promise<T | undefined> {
      const bytes = await driver().get(key);
      return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : undefined;
    },
  };
}
