import { createContext, resolveDefaultOrganizationId } from "./context.ts";
import { createApp } from "./http/app.ts";
import { ConfigError } from "./platform/config/index.ts";
import { seed } from "./platform/database/seed.ts";

async function main(): Promise<void> {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  try {
    ctx = await createContext();
  } catch (err) {
    // Config invalid harus terlihat saat bootstrap, bukan saat request pertama.
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw err;
  }

  // Idempotent: fresh clone tanpa `db:seed` tetap punya organisasi default.
  await seed(ctx.db);

  const organizationId = await resolveDefaultOrganizationId(ctx.db);
  const app = createApp(ctx, organizationId);
  const server = Bun.serve({ port: ctx.env.APP_PORT, fetch: app.fetch });

  ctx.logger.info({
    event: "server.started",
    port: server.port,
    url: ctx.env.APP_URL,
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
