import { requireApps } from "../lib/apps.ts";
import { buildCloudflare } from "../lib/cloudflare.ts";
import { run } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

export const commands = [
  defineCommand("cloudflare:dev", async () => {
    await requireApps(["server", "web"]);
    await run(["bun", "run", "--cwd", "apps/web", "dev:cloudflare"], "Cloudflare Workers dev");
  }),
  defineCommand("cloudflare:build", async () => {
    await requireApps(["server", "web"]);
    await buildCloudflare();
  }),
  defineCommand("cloudflare:deploy", async () => {
    await requireApps(["server", "web"]);
    await run(["bun", "cli/index.ts", "cloudflare:build"], "Cloudflare Worker build");
    await run(
      ["bun", "run", "--cwd", "apps/web", "wrangler", "deploy", "--config", "dist/loom_template/wrangler.json"],
      "Cloudflare deploy",
    );
  }),
];
