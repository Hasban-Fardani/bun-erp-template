export const AGENT_SKILL_SOURCES = [
  { repository: "mattpocock/skills", skills: ["grill-me", "grilling"] },
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
