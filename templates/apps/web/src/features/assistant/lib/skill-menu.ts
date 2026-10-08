export type SkillSummary = { key: string; title: string; description: string };

/**
 * The text after a leading `/` while the composer holds only that command word, else null. The menu
 * therefore opens at the start of a message and closes as soon as the user types a space.
 */
export function matchSkillQuery(draft: string): string | null {
  const match = /^\/(\S*)$/.exec(draft);
  return match ? (match[1] ?? "") : null;
}

export function filterSkills<T extends SkillSummary>(skills: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...skills];
  return skills.filter((skill) => skill.key.includes(needle) || skill.title.toLowerCase().includes(needle));
}

/** Arrow-key movement that wraps at both ends. */
export function moveIndex(index: number, length: number, direction: "up" | "down"): number {
  if (length <= 0) return 0;
  return direction === "down" ? (index + 1) % length : (index - 1 + length) % length;
}
