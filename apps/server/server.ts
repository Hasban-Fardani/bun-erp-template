import { createContext } from "./bootstrap.ts";
import { resolveDefaultOrganizationId } from "./context.ts";
import { createApp } from "./http/app.ts";
import { createHostFetch } from "./http/host.ts";
import { createWebAssetsApp } from "./http/web-assets.ts";
import { ConfigError } from "./platform/config/index.ts";
import { seed } from "./platform/database/seed.ts";

const apiOnly = process.argv.includes("--api-only");
const webDist = `${import.meta.dir}/../web/dist`;

async function main(): Promise<void> {
  if (!apiOnly && !(await Bun.file(`${webDist}/index.html`).exists())) {
    process.stderr.write("Web build not found. Run `bun erp build` before `bun start`.\n");
    process.exit(1);
  }

  let ctx: Awaited<ReturnType<typeof createContext>>;
  try {
    ctx = await createContext();
  } catch (err) {
    // Invalid config must surface at bootstrap, not on the first request.
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw err;
  }

  // Idempotent: a fresh clone without `db:seed` still has a default organization.
  await seed(ctx.db);

  const organizationId = await resolveDefaultOrganizationId(ctx.db);
  const app = createApp(ctx, organizationId);
  const webApp = apiOnly ? undefined : createWebAssetsApp(webDist, ctx.env.isProduction);
  const server = Bun.serve({
    port: ctx.env.APP_PORT,
    fetch: createHostFetch(app.fetch, webApp?.fetch),
  });

  ctx.logger.info({
    event: "server.started",
    port: server.port,
    mode: apiOnly ? "api-only" : "web-and-api",
    app_url: ctx.env.APP_URL,
    listen_url: `http://localhost:${server.port}`,
    api_url: `${ctx.env.APP_URL}/api`,
    web_path: apiOnly ? undefined : "/",
    api_path: "/api",
    api_prefix: "/api/v1",
    health_path: "/api/v1/health",
    docs_path: "/api/docs",
    environment: ctx.env.APP_ENV,
    release: ctx.env.APP_RELEASE,
    database_driver: ctx.env.DATABASE_DRIVER,
  });

  const shutdown = async (signal: string): Promise<void> => {
    ctx.logger.info({ event: "server.stopping", signal });
    await server.stop();
    await ctx.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

await main();
