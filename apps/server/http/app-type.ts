import type { ApplyGlobalResponse } from "hono/client";
import type { createApp } from "./app.ts";
import type { ApiErrorBody } from "./errors.ts";

export type AppType = ApplyGlobalResponse<
  ReturnType<typeof createApp>,
  {
    [Status in 400 | 401 | 403 | 404 | 409 | 422 | 500]: { json: ApiErrorBody };
  }
>;
