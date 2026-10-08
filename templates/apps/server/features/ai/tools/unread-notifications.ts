import * as z from "zod";
import { countUnread, listUnreadTitles } from "../../notifications/index.ts";
import { defineTool } from "./define.ts";

/** Self-scoped: reads only the actor's own inbox, so it needs no permission key. */
export const unreadNotificationsTool = defineTool({
  name: "unread_notifications",
  description: "How many unread notifications the current user has, plus the titles of the latest few.",
  parameters: z.object({}),
  async run(ctx, actor) {
    const [count, latest] = await Promise.all([
      countUnread(ctx.db, actor.userId),
      listUnreadTitles(ctx.db, actor.userId, 5),
    ]);
    return { unread: count, latest };
  },
});
