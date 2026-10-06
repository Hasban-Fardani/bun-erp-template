import { requireApps } from "../lib/apps.ts";
import { buildCloudflare, deploymentTarget } from "../lib/cloudflare.ts";
import { run } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

export const commands = [
  defineCommand("dev", async () => {
    // The dev task serves the API and, when installed, the Vite app on top of it.
    await requireApps(["server"]);
    await run(["bun", "apps/server/cli/tasks/dev.ts"], "local web and API development");
  }),

  defineCommand("server:api", async () => {
    await requireApps(["server"]);
    await run(["bun", "apps/server/bootstrap/server.ts", "--api-only"], "API-only server");
  }),

  /** Build the client assets served by the default Bun web-and-API server. */
  defineCommand("build", async () => {
    await requireApps(["web"]);
    if (deploymentTarget() === "cloudflare") {
      await buildCloudflare();
      process.stdout.write("build: OK — Cloudflare Worker and static assets are in apps/web/dist\n");
      return;
    }
    await run(["bun", "run", "--cwd", "apps/web", "build"], "web build (vite)");
    process.stdout.write("build: OK — output in apps/web/dist\n");
  }),

  defineCommand("preview", async () => {
    await requireApps(["web"]);
    await run(["bun", "run", "--cwd", "apps/web", "preview", "--host", "127.0.0.1"], "web preview");
  }),
];
