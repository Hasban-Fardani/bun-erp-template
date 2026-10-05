import type { AppContext } from "./context.ts";
import { createAuth } from "./features/identity/auth.ts";
import { loadEnv } from "./platform/config/index.ts";
import { createPostgresDatabase } from "./platform/database/postgres.ts";
import { createWorkerLogger } from "./platform/observability/worker-logger.ts";

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
  const { db, close } = createPostgresDatabase(env.DATABASE_URL, Math.min(env.DATABASE_POOL_MAX, 5), false);
  const logger = createWorkerLogger("bun-erp", env.APP_ENV, env.APP_RELEASE);
  return { env, db, logger, close };
}

/** HTTP requests need auth; scheduled queue ticks only need the database and logger. */
export function createCloudflareContext(bindings: WorkerBindings): AppContext {
  const infrastructure = createCloudflareInfrastructure(bindings);
  const auth = createAuth(infrastructure.env, infrastructure.db);
  return { ...infrastructure, auth };
}
