import { loadEnv } from "../config/index.ts";
import { createPostgresDatabase } from "../database/postgres.ts";
// @erp:mail
import { createEventListeners } from "../features/events.ts";
import { createAuth } from "../features/identity/auth.ts";
import { configurePermissionCache } from "../features/rbac/cache.ts";
import { createCacheFromEnv } from "../infra/cache/from-env.ts";
import { registerEventListeners } from "../infra/events/index.ts";
import { createWorkerLogger } from "../infra/observability/worker-logger.ts";
import { createStorage } from "../infra/storage.ts";
import type { AppContext } from "./context.ts";

type HyperdriveBinding = { connectionString: string };
export type WorkerBindings = Record<string, unknown> & {
  HYPERDRIVE: HyperdriveBinding;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

export type CloudflareInfrastructureContext = Omit<AppContext, "auth">;

/** Worker bindings use the same validated environment contract as the Bun runtime. */
export function createCloudflareInfrastructure(bindings: WorkerBindings): CloudflareInfrastructureContext {
  const source: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") source[key] = value;
  }
  source.APP_DEPLOY_TARGET = "cloudflare";
  source.APP_WEB_MODE = "integrated";
  source.DATABASE_DRIVER = "postgres";
  source.DATABASE_URL = bindings.HYPERDRIVE.connectionString;
  source.LOG_DRIVER = "console";
  source.LOG_PATH = "stdout";

  const env = loadEnv(source);
  // Hyperdrive owns pooling; clients and their sockets remain scoped to this invocation.
  // DATABASE_SSL_MODE is deliberately not applied here: Hyperdrive terminates origin TLS, so it
  // owns the TLS setting for the Worker-to-database path (docs/operations.md, "Database TLS").
  const logger = createWorkerLogger("bun-erp", env.APP_ENV, env.APP_RELEASE);
  const { db, close } = createPostgresDatabase(env.DATABASE_URL, Math.min(env.DATABASE_POOL_MAX, 5), false, { logger });
  registerEventListeners(createEventListeners());
  const cache = createCacheFromEnv({ env, db, bindings });
  configurePermissionCache({ enabled: env.PERMISSION_CACHE_ENABLED, cache });
  const storage = createStorage({ env, bindings });
  return { env, db, logger, storage, cache, close };
}

/** HTTP requests need auth; scheduled queue ticks only need the database and logger. */
export function createCloudflareContext(bindings: WorkerBindings): AppContext {
  const infrastructure = createCloudflareInfrastructure(bindings);
  const auth = createAuth(infrastructure.env, infrastructure.db);
  return { ...infrastructure, auth };
}
