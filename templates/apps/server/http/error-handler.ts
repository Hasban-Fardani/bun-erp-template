import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../bootstrap/context.ts";
import type { AppEnv } from "./factory.ts";
import { ApiError, type ApiErrorBody, ErrorCode, requestId } from "./helpers/errors.ts";

export function registerErrorHandler(app: Hono<AppEnv>, ctx: AppContext) {
  app.notFound(() => {
    throw ApiError.notFound();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 400)
      err = new ApiError("BAD_REQUEST", 400, "Malformed request body");
    const id = requestId(c);
    if (err instanceof ApiError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
        meta: { requestId: id },
      };
      return c.json(body, err.status as 400);
    }

    // Unexpected failure: full trace in the server log, safe message for the client.
    ctx.logger.error({
      event: "http.request.failed",
      trace_id: id,
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const body: ApiErrorBody = {
      error: { code: ErrorCode.internal, message: "Internal server error" },
      meta: { requestId: id },
    };
    return c.json(body, 500);
  });
}
