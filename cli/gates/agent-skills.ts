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
