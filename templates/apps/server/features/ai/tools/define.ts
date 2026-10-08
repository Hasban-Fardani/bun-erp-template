import * as z from "zod";
import type { AppContext } from "@/bootstrap/context.ts";
import type { AiToolSpec } from "@/infra/ai/index.ts";
import type { Actor } from "../../identity/index.ts";
import type { PermissionKey } from "../../rbac/index.ts";

/**
 * A tool the assistant may ask the server to run. Tools are read-only by contract: they look things
 * up for the signed-in actor and never write. `run` receives the actor, so it must scope its query
 * to what that actor may see; `permission` only hides the whole tool from actors who lack it.
 */
export type Tool<Schema extends z.ZodType = z.ZodType> = {
  /** snake_case name the model calls. */
  name: string;
  /** What it returns and when to use it; the model reads this. */
  description: string;
  /** Arguments; validated with this schema before `run`, so `args` is already typed and bounded. */
  parameters: Schema;
  permission?: PermissionKey;
  run(ctx: AppContext, actor: Actor, args: z.output<Schema>): Promise<unknown>;
};

export function defineTool<Schema extends z.ZodType>(tool: Tool<Schema>): Tool<Schema> {
  return tool;
}

/** The JSON Schema the model sees for a tool's arguments. */
export function toolSpec(tool: Tool): AiToolSpec {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.parameters) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, parameters };
}
