import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { ApiError, ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import { requireActor } from "../identity/policy.ts";
import { countUnread, listNotifications, markAllRead, markRead } from "./service.ts";
import { ListNotificationsInput } from "./validation.ts";

const notificationRef = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    data: { type: ["object", "null"] },
    readAt: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
} as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: notificationRef }, ...listMetaSchemaProperties },
};

/**
 * Self-scoped: every handler operates on `actor.userId`, so an inbox never needs a permission key
 * and one user can never read another's notifications.
 */
export function notificationRoutes(ctx: AppContext) {
  return new Hono<{ Variables: AppVariables }>()
    .get(
      "/",
      doc({
        tag: "notifications",
        summary: "Daftar notifikasi saya",
        query: ListNotificationsInput,
        data: listData,
      }),
      validate("query", ListNotificationsInput),
      async (c) => {
        const actor = await requireActor(c, ctx);
        const input = c.req.valid("query");
        const { items, total } = await listNotifications(ctx.db, actor.userId, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/unread-count",
      doc({
        tag: "notifications",
        summary: "Jumlah notifikasi belum dibaca",
        data: { type: "object", properties: { count: { type: "integer" } } },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        return ok(c, { count: await countUnread(ctx.db, actor.userId) });
      },
    )
    .post(
      "/read-all",
      doc({
        tag: "notifications",
        summary: "Tandai semua notifikasi dibaca",
        data: { type: "object", properties: { updated: { type: "integer" } } },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        return ok(c, { updated: await markAllRead(ctx.db, actor.userId) });
      },
    )
    .post(
      "/:id/read",
      doc({
        tag: "notifications",
        summary: "Tandai satu notifikasi dibaca",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        const id = c.req.param("id");
        if (!(await markRead(ctx.db, actor.userId, id))) throw ApiError.notFound("Notification not found");
        return ok(c, { id });
      },
    );
}
