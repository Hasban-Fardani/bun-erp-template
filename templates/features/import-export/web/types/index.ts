import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

/** One registered resource as the wizard and export action see it. */
export type ImportExportResource = InferResponseType<
  (typeof rpc)["import-export"]["resources"]["$get"],
  200
>["data"]["items"][number];

/** One import batch row in the history table. */
export type ImportBatch = InferResponseType<
  (typeof rpc)["import-export"]["imports"]["$get"],
  200
>["data"]["items"][number];

/** Dry-run result with row-level errors. */
export type ImportDryRunReport = InferResponseType<
  (typeof rpc)["import-export"]["imports"]["dry-run"]["$post"],
  200
>["data"];

/** Live progress of one import batch. */
export type ImportProgress = InferResponseType<(typeof rpc)["import-export"]["imports"][":id"]["$get"], 200>["data"];

/** Selected columns plus the row matrix the browser turns into a file. */
export type ExportData = InferResponseType<(typeof rpc)["import-export"]["exports"][":resource"]["$get"], 200>["data"];

export type ImportExportFormat = "csv" | "xlsx";
