import { createUuid } from "@bun-erp/utils";
import { createCloudflareContext, createCloudflareInfrastructure, type WorkerBindings } from "./cloudflare-context.ts";
import { resolveDefaultOrganizationId } from "./context.ts";
import { createJobRegistry } from "./features/jobs.ts";
import { createApp } from "./http/app.ts";
import { isApiPath } from "./http/routing.ts";
import { usingWorkerContext } from "./platform/cloudflare/lifecycle.ts";
import { requiresOrganizationId } from "./platform/cloudflare/routing.ts";
import { runJobBatch } from "./platform/jobs/queue.ts";

const CLOUDFLARE_JOB_BATCH_SIZE = 1;

export default {
  async fetch(
    request: Request,
    bindings: WorkerBindings,
    execution: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!isApiPath(path)) {
      return bindings.ASSETS ? bindings.ASSETS.fetch(request) : new Response("Not Found", { status: 404 });
    }
    try {
      return await usingWorkerContext(
        () => createCloudflareContext(bindings),
        async (context) => {
          const organizationId = requiresOrganizationId(path, request.method)
            ? await resolveDefaultOrganizationId(context.db)
            : "";
          return createApp(context, organizationId).fetch(request);
        },
        execution,
      );
    } catch {
      const suppliedId = request.headers.get("X-Request-Id");
      const requestId = suppliedId && suppliedId.length <= 128 ? suppliedId : createUuid();
      return Response.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable" }, meta: { requestId } },
        { status: 503, headers: { "X-Request-Id": requestId } },
      );
    }
  },

  async scheduled(
    _controller: { cron: string; scheduledTime: number },
    bindings: WorkerBindings,
    execution: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    execution.waitUntil(
      (async () => {
        const context = createCloudflareInfrastructure(bindings);
        try {
          const count = await runJobBatch(context.db, createJobRegistry(context), context.logger, {
            limit: CLOUDFLARE_JOB_BATCH_SIZE,
          });
          context.logger.info({ event: "jobs.schedule.completed", processed: count });
        } catch {
          context.logger.error({ event: "jobs.schedule.failed" });
        } finally {
          await context.close();
        }
      })(),
    );
  },
};
