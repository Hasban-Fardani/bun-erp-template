export const AGENT_SKILL_SOURCES = [
  {
    repository: "mattpocock/skills",
    skills: [
      "grill-me",
      "grilling",
      "grill-with-docs",
      "domain-modeling",
      "to-spec",
      "to-tickets",
      "tdd",
      "implement",
      "code-review",
      "diagnosing-bugs",
      "codebase-design",
    ],
  },
  { repository: "pbakaus/impeccable", skills: ["impeccable"] },
  { repository: "ayghri/i-have-adhd", skills: ["i-have-adhd"] },
  { repository: "cathrynlavery/diagram-design", skills: ["diagram-design"] },
  { repository: "upstash/context7", skills: ["find-docs", "context7-mcp"] },
  {
    repository: "ChromeDevTools/chrome-devtools-mcp",
    skills: ["chrome-devtools", "a11y-debugging", "debug-optimize-lcp", "memory-leak-debugging"],
  },
  {
    repository: "petrkindlmann/qa-skills",
    skills: [
      "qa-project-context",
      "test-strategy",
      "test-planning",
      "risk-based-testing",
      "exploratory-testing",
      "playwright-automation",
      "bug-reproduction",
      "ai-bug-triage",
      "qa-report-humanizer",
      "test-environments",
      "test-data-management",
      "agentic-browser-testing",
    ],
  },
] as const;

export const REQUIRED_AGENT_SKILLS = AGENT_SKILL_SOURCES.flatMap(({ skills }) => skills);

/**
 * Each agent discovers skills only in its own project directory: Codex and compatible agents read
 * `.agents/skills`, Claude Code reads `.claude/skills`. A skill missing from one directory is
 * invisible to that agent, so every directory must hold every skill.
 */
export const AGENT_SKILL_TARGETS = [
  { agent: "codex", dir: ".agents/skills" },
  { agent: "claude-code", dir: ".claude/skills" },
] as const;

export const AGENT_SKILL_DIRS = AGENT_SKILL_TARGETS.map(({ dir }) => dir);

/** Repo-relative `<dir>/<skill>` paths whose `SKILL.md` is absent, grouped by directory. */
export async function missingAgentSkills(
  root: string,
  skills: readonly string[] = REQUIRED_AGENT_SKILLS,
): Promise<string[]> {
  const missing: string[] = [];
  for (const dir of AGENT_SKILL_DIRS) {
    for (const skill of skills) {
      if (!(await Bun.file(`${root}/${dir}/${skill}/SKILL.md`).exists())) missing.push(`${dir}/${skill}`);
    }
  }
  return missing;
}
