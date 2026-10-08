import type { Actor } from "../../identity/index.ts";
import type { Tool } from "./define.ts";
import { findUsersTool } from "./find-users.ts";
import { unreadNotificationsTool } from "./unread-notifications.ts";

export { defineTool, type Tool, toolSpec } from "./define.ts";

/**
 * The tool registry. Adding a tool is one new file in this folder plus one line here. Tools are
 * read-only; the chat flow offers each actor only the tools their permissions allow, runs at most
 * `AI_MAX_TOOL_CALLS` per question and truncates every result (docs/ai.md).
 */
// biome-ignore lint/suspicious/noExplicitAny: a heterogeneous registry; each tool is typed by its own schema.
export const tools: readonly Tool<any>[] = [unreadNotificationsTool, findUsersTool];

/** The tools this actor may be offered. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
export function toolsFor(actor: Pick<Actor, "permissions">, list: readonly Tool<any>[] = tools): Tool[] {
  return list.filter((tool) => tool.permission === undefined || actor.permissions.includes(tool.permission));
}
