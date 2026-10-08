import { asc, ilike, or } from "drizzle-orm";
import * as z from "zod";
import { escapeLikePattern } from "@/http/helpers/list-query.ts";
import { users } from "../../identity/index.ts";
import { defineTool } from "./define.ts";

const MAX_ROWS = 5;

/** Needs `user.read`, like the users list; returns only id, name and email, never roles or flags. */
export const findUsersTool = defineTool({
  name: "find_users",
  description: "Search users by name or email. Returns at most 5 matches with id, name and email.",
  permission: "user.read",
  parameters: z.object({ query: z.string().trim().min(1).max(80).describe("Part of a name or an email address") }),
  async run(ctx, _actor, args) {
    const pattern = `%${escapeLikePattern(args.query)}%`;
    const rows = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(or(ilike(users.name, pattern), ilike(users.email, pattern)))
      .orderBy(asc(users.name))
      .limit(MAX_ROWS);
    return { users: rows };
  },
});
