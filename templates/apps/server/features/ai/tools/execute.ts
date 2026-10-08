import type { AppContext } from "@/bootstrap/context.ts";
import type { Actor } from "../../identity/index.ts";
import type { Tool } from "./define.ts";

/** Upper bound on one tool result handed to the model; keeps the prompt (and Neurons) small. */
export const MAX_TOOL_RESULT_CHARS = 2048;

export type ToolOutcome = { status: "done" | "error"; content: string };

const failure = (message: string): ToolOutcome => ({ status: "error", content: JSON.stringify({ error: message }) });

export function truncateResult(json: string): string {
  return json.length <= MAX_TOOL_RESULT_CHARS ? json : `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`;
}

/**
 * Runs one tool call for an actor. The permission is checked again here (the model could name a tool
 * that was never offered), arguments are validated, and any failure becomes a short result for the
 * model instead of an exception, so a bad tool never fails the whole answer. Error text is generic:
 * internals and message content are never forwarded to the model or logged.
 */
export async function executeTool(
  ctx: AppContext,
  actor: Actor,
  tool: Tool,
  rawArguments: unknown,
): Promise<ToolOutcome> {
  if (tool.permission && !actor.permissions.includes(tool.permission)) return failure("not allowed");
  const parsed = tool.parameters.safeParse(rawArguments);
  if (!parsed.success) return failure("invalid arguments");
  try {
    const result = await tool.run(ctx, actor, parsed.data);
    return { status: "done", content: truncateResult(JSON.stringify(result ?? null)) };
  } catch {
    ctx.logger.error({ event: "ai.tool_failed", tool: tool.name });
    return failure("the tool failed");
  }
}
