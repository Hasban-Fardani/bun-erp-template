import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { ApiError, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { idParam } from "../../http/helpers/params.ts";
import { validate } from "../../http/helpers/validate.ts";
import { authorizeActor } from "./policy.ts";
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
  return factory
    .createApp()
    .get(
      "/",
      authorizeActor(ctx),
      doc({
        tag: "notifications",
        summary: "Daftar notifikasi saya",
        query: ListNotificationsInput,
        data: listData,
      }),
      validate("query", ListNotificationsInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("query");
        const { items, total } = await listNotifications(ctx.db, actor.userId, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/unread-count",
      authorizeActor(ctx),
      doc({
        tag: "notifications",
        summary: "Jumlah notifikasi belum dibaca",
        data: { type: "object", properties: { count: { type: "integer" } } },
      }),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, { count: await countUnread(ctx.db, actor.userId) });
      },
    )
    .post(
      "/read-all",
      authorizeActor(ctx),
      doc({
        tag: "notifications",
        summary: "Tandai semua notifikasi dibaca",
        data: { type: "object", properties: { updated: { type: "integer" } } },
      }),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, { updated: await markAllRead(ctx.db, actor.userId) });
      },
    )
    .post(
      "/:id/read",
      authorizeActor(ctx),
      doc({
        tag: "notifications",
        summary: "Tandai satu notifikasi dibaca",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),
      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        const id = c.req.param("id");
        if (!(await markRead(ctx.db, actor.userId, id))) throw ApiError.notFound("Notification not found");
        return ok(c, { id });
      },
    );
}
