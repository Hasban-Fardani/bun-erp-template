import { ConfigError, loadEnv } from "../config/index.ts";
import { seed } from "../database/seed.ts";
import { createJobRegistry, createSchedules } from "../features/jobs.ts";
import { createApp } from "../http/app.ts";
import { createHostFetch } from "../http/host.ts";
import { createWebAssetsApp } from "../http/web-assets.ts";
import { startJobWorker } from "../infra/jobs/worker.ts";
import { createContext } from "./bootstrap.ts";

const apiOnly = process.argv.includes("--api-only");
const webDist = `${import.meta.dir}/../../web/dist`;

/** SQLSTATEs that mean the live schema does not match the catalog this code ships with. */
const SCHEMA_OUT_OF_DATE = new Set(["42P10", "42P01", "42703"]);
const SCHEMA_OUT_OF_DATE_HINT = "database schema is out of date with the catalog; run `bun loom db:status`";

async function main(): Promise<void> {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
    if (env.APP_DEPLOY_TARGET !== "bun") {
      throw new ConfigError([
        "APP_DEPLOY_TARGET=cloudflare uses `bun loom cloudflare:dev` or `bun loom cloudflare:deploy`",
      ]);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(78);
    }
    throw err;
  }

  const servesWeb = !apiOnly && env.APP_WEB_MODE === "integrated";
  if (servesWeb && !(await Bun.file(`${webDist}/index.html`).exists())) {
    process.stderr.write("Web build not found. Run `bun loom build` before `bun start`.\n");
    process.exit(1);
  }

  let ctx: Awaited<ReturnType<typeof createContext>>;
  try {
    ctx = await createContext({ env, migrateOnStart: true });
    // Idempotent: a fresh clone without `db:seed` still has the RBAC catalogue and system roles.
    await seed(ctx.db);
  } catch (err) {
    // Invalid config must surface at bootstrap, not on the first request.
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    failBoot(env, err);
  }

  const app = createApp(ctx);
  const webApp = servesWeb ? createWebAssetsApp(webDist, ctx.env.isProduction) : undefined;
  const server = Bun.serve({
    port: ctx.env.APP_PORT,
    fetch: createHostFetch(app.fetch, webApp?.fetch),
  });
  const jobWorker = process.argv.includes("--with-jobs")
    ? startJobWorker({
        db: ctx.db,
        registry: createJobRegistry(ctx),
        schedules: createSchedules(ctx),
        logger: ctx.logger,
      })
    : undefined;

  ctx.logger.info({
    event: "server.started",
    port: server.port,
    mode: servesWeb ? "web-and-api" : "api-only",
    app_url: ctx.env.APP_URL,
    listen_url: `http://localhost:${server.port}`,
    api_url: `${ctx.env.APP_URL}/api`,
    web_path: servesWeb ? "/" : undefined,
    api_path: "/api",
    api_prefix: "/api/v1",
    health_path: "/api/v1/health",
    docs_path: "/api/docs",
    environment: ctx.env.APP_ENV,
    release: ctx.env.APP_RELEASE,
    database_driver: ctx.env.DATABASE_DRIVER,
  });

  let shutdownTask: Promise<void> | undefined;
  const shutdown = (signal: string): Promise<void> => {
    if (shutdownTask) return shutdownTask;
    shutdownTask = shutdownOnce(signal);
    return shutdownTask;
  };

  async function shutdownOnce(signal: string): Promise<void> {
    ctx.logger.info({ event: "server.stopping", signal });
    jobWorker?.stop();
    try {
      await server.stop();
      if (jobWorker) await jobWorker.done;
    } finally {
      await ctx.close();
    }
    ctx.logger.info({ event: "server.stopped" });
  }

  const requestShutdown = (signal: string) => {
    void shutdown(signal).catch((error: unknown) => {
      ctx.logger.error({ event: "server.shutdown_failed", errorCode: errorCode(error) });
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", () => requestShutdown("SIGTERM"));
  process.once("SIGINT", () => requestShutdown("SIGINT"));
}

/**
 * Log one structured `boot.failed` event, then exit 1. The write goes straight to stderr because
 * the pino destination is asynchronous and `process.exit` would drop the event; the dev
 * orchestrator reads the line to fail fast with the cause, the Postgres `code`, and the hint.
 */
function failBoot(env: ReturnType<typeof loadEnv>, error: unknown): never {
  const chain = causeChain(error);
  const pgCode = chain.map(postgresCode).find((code) => code !== undefined);
  const event = {
    level: 50,
    time: new Date().toISOString(),
    service: "loom",
    environment: env.APP_ENV,
    release: env.APP_RELEASE,
    event: "boot.failed",
    error: messageOf(error),
    errorCode: errorCode(error, "SERVER_BOOT_FAILED"),
    causes: chain.slice(1).map(messageOf),
    pgCode,
    hint: pgCode !== undefined && SCHEMA_OUT_OF_DATE.has(pgCode) ? SCHEMA_OUT_OF_DATE_HINT : undefined,
  };
  process.stderr.write(`${JSON.stringify(event)}\n`);
  process.exit(1);
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let node: unknown = error;
  while (node !== null && node !== undefined && !chain.includes(node)) {
    chain.push(node);
    node = (node as { cause?: unknown }).cause;
  }
  return chain;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function postgresCode(node: unknown): string | undefined {
  const code = (node as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

await main();

function errorCode(error: unknown, fallback = "SERVER_SHUTDOWN_FAILED"): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.name) ? error.name : fallback;
}
