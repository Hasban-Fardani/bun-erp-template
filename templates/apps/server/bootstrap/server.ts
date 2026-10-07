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

async function main(): Promise<void> {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
    if (env.APP_DEPLOY_TARGET !== "bun") {
      throw new ConfigError([
        "APP_DEPLOY_TARGET=cloudflare uses `bun erp cloudflare:dev` or `bun erp cloudflare:deploy`",
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
    process.stderr.write("Web build not found. Run `bun erp build` before `bun start`.\n");
    process.exit(1);
  }

  let ctx: Awaited<ReturnType<typeof createContext>>;
  try {
    ctx = await createContext({ env, migrateOnStart: true });
  } catch (err) {
    // Invalid config must surface at bootstrap, not on the first request.
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw err;
  }

  // Idempotent: a fresh clone without `db:seed` still has the RBAC catalogue and system roles.
  await seed(ctx.db);

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

await main();

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.name) ? error.name : "SERVER_SHUTDOWN_FAILED";
}
