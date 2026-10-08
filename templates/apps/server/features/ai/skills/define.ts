import type { PermissionKey } from "../../rbac/index.ts";

/**
 * A skill is a named instruction set the user picks with `/` in the composer. It changes how the
 * assistant answers one question; it adds no data access (that is what tools are for).
 */
export type Skill = {
  /** Stable kebab-case id sent by the browser (`skill` in the chat body). */
  key: string;
  title: string;
  /** One line shown in the `/` menu. */
  description: string;
  /** Appended to the server-owned system prompt. Write it as instructions to the assistant. */
  instructions: string;
  /** When set, only actors holding it see the skill; others get 403 if they send its key. */
  permission?: PermissionKey;
};

export function defineSkill(skill: Skill): Skill {
  return skill;
}
