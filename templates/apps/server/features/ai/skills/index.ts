import type { Actor } from "../../identity/index.ts";
import type { Skill } from "./define.ts";
import { summarizeSkill } from "./summarize.ts";
import { translateSkill } from "./translate.ts";
import { writeEmailSkill } from "./write-email.ts";

export { defineSkill, type Skill } from "./define.ts";

/**
 * The skill registry. Adding a skill is one new file in this folder plus one line here; the `/` menu,
 * `GET /ai/skills` and the chat route pick it up with no other change (docs/ai.md).
 */
export const skills: readonly Skill[] = [summarizeSkill, writeEmailSkill, translateSkill];

const mayUse = (actor: Pick<Actor, "permissions">, skill: Skill) =>
  skill.permission === undefined || actor.permissions.includes(skill.permission);

/** The skills this actor may pick. */
export function skillsFor(actor: Pick<Actor, "permissions">, list: readonly Skill[] = skills): Skill[] {
  return list.filter((skill) => mayUse(actor, skill));
}

/** Finds the skill a chat request names, or says why it cannot be used. */
export function resolveSkill(
  actor: Pick<Actor, "permissions">,
  key: string,
  list: readonly Skill[] = skills,
): { skill: Skill } | { error: "unknown" | "forbidden" } {
  const skill = list.find((candidate) => candidate.key === key);
  if (!skill) return { error: "unknown" };
  return mayUse(actor, skill) ? { skill } : { error: "forbidden" };
}
