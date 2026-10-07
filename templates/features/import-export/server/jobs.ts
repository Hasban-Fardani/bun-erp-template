import type { AppContext } from "../../bootstrap/context.ts";
import type { BatchHandlerRegistry, JobBatchProgress } from "../../infra/jobs/batch.ts";
import { notify } from "../notifications/index.ts";
import { type ImportRowValues, importExportResources } from "./registry.ts";
import { IMPORT_BATCH_NAME } from "./service.ts";

/**
 * Registers the import batch handler. `apps/server/features/jobs.ts` owns the composition root, so
 * `bun erp features:install import-export` documents adding
 * `registerImportExportBatchHandlers(batches, ctx)` there. The handler is idempotent by contract:
 * a resumed batch can deliver the same row again, so a resource's `importRow` must upsert.
 */
export function registerImportExportBatchHandlers(
  handlers: BatchHandlerRegistry,
  ctx: Pick<AppContext, "env" | "db" | "logger">,
): void {
  handlers.register(
    IMPORT_BATCH_NAME,
    async (payload, context) => {
      const resourceName = typeof payload.resource === "string" ? payload.resource : "";
      const resource = importExportResources.get(resourceName);
      if (!resource?.importRow)
        throw namedError("IMPORT_RESOURCE_NOT_REGISTERED", `Resource not registered: ${resourceName}`);
      await resource.importRow(context.db, readRowValues(payload.values), {
        batchId: context.batchId,
        itemKey: context.itemKey,
        attempt: context.attempt,
      });
    },
    {
      onComplete: async (progress) => {
        await notifyImportFinished(progress, ctx);
      },
    },
  );
}

async function notifyImportFinished(
  progress: JobBatchProgress,
  ctx: Pick<AppContext, "env" | "db" | "logger">,
): Promise<void> {
  const actorId = typeof progress.metadata.actorId === "string" ? progress.metadata.actorId : "";
  if (!actorId) return;
  const label =
    typeof progress.metadata.label === "string" && progress.metadata.label ? progress.metadata.label : "Import";
  const imported = progress.processed - progress.failed;
  await notify(
    { db: ctx.db, logger: ctx.logger, env: ctx.env },
    {
      recipients: [actorId],
      type: "import-export.import_completed",
      title: `${label}: import finished`,
      body: `${imported} of ${progress.total} rows imported${progress.failed > 0 ? `, ${progress.failed} failed` : ""}.`,
      data: {
        batchId: progress.id,
        resource: progress.metadata.resource ?? null,
        total: progress.total,
        failed: progress.failed,
      },
    },
  );
}

/** Payload values arrive as JSON; only string cells survive, so a bad payload fails rows, not code. */
function readRowValues(raw: unknown): ImportRowValues {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}
