import * as z from "zod";
import { listQueryParts } from "../../http/list-query.ts";

/** `read=true` lists only read rows; `read=false` only unread; omitted lists everything. */
export const listNotificationsSchema = z.strictObject({
  ...listQueryParts({ sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultDir: "desc" }),
  read: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const ListNotificationsInput = z.compile(listNotificationsSchema);

export type ListNotificationsInput = z.output<typeof ListNotificationsInput>;
