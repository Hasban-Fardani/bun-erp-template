import { resolve } from "node:path";
import { repoRoot, run } from "./repo.ts";

export function deploymentTarget(): "bun" | "cloudflare" {
  const target = process.env.APP_DEPLOY_TARGET ?? "bun";
  if (target !== "bun" && target !== "cloudflare") {
    throw new Error(`Unsupported APP_DEPLOY_TARGET=${target}. Implemented targets: bun, cloudflare.`);
  }
  return target;
}

export async function buildCloudflare(): Promise<void> {
  const webMode = process.env.APP_WEB_MODE ?? "integrated";
  if (webMode !== "integrated") {
    throw new Error("Cloudflare currently requires APP_WEB_MODE=integrated.");
  }

  const generatedLocalBindings = resolve(repoRoot, "apps/web/dist/bun_erp_template/.dev.vars");
  try {
    await run(["bun", "run", "--cwd", "apps/web", "build:cloudflare"], "Cloudflare Worker build");
  } finally {
    // The Vite plugin can materialize values from a local .env for development; they never belong in deploy output.
    await Bun.$`rm -f ${generatedLocalBindings}`.quiet();
  }
}
