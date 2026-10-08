import { Scalar } from "@scalar/hono-api-reference";
import type { AppContext } from "../bootstrap/context.ts";
import { buildApp } from "./build-app.ts";

/**
 * The Bun-target application: `buildApp` plus the Scalar API reference at `/api/docs`. The
 * Cloudflare Worker uses `buildApp` directly, so Scalar never enters the Worker bundle.
 */
export function createApp(ctx: AppContext) {
  return buildApp(ctx, (url, pageTitle) => Scalar({ url, pageTitle }));
}
