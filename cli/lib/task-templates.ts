import { DESIGN_DOCUMENTS, FLOW_PHASES, PHASE_GUIDE } from "../gates/tasks.ts";

/**
 * `bun loom task:new` scaffolds. An owner carries the six-phase flow and gets a design pack; a ticket
 * inherits the owner's flow. Every scaffold passes `bun loom check:task` as written, and none of its
 * placeholders (HTML comments, empty sections) satisfies a phase once that phase is ticked.
 */

const EVIDENCE_GRAMMAR = (
  id: string,
) => `\`tdd: required\` makes \`bun loom check\` enforce this grammar for every ticked \`**<ID>**\` item:

\`\`\`text
- red: ${id}.1 \`bun loom test --filter thing\` — 1 fail: expected 2, received 1
- green: ${id}.1 \`bun loom test --filter thing\` — 1 pass
- red: ${id}.3 n/a — docs-only, nothing executable to fail
- green: ${id}.3 \`bun loom check\` — 0 findings
\`\`\`

Red comes before green for the same ID. \`NOT_RUN\` and \`BLOCKED\` items stay unticked.`;

const dependsOnLine = (dependsOn: readonly string[]) =>
  dependsOn.length > 0 ? `depends_on: ${dependsOn.join(", ")}\n` : "";

export function renderOwnerTask(id: string, title: string, dependsOn: readonly string[] = []): string {
  const phases = FLOW_PHASES.map((phase) => `- [ ] ${phase}:`).join("\n");
  const guide = FLOW_PHASES.map((phase, index) => `${index + 1}. ${phase} — ${PHASE_GUIDE[phase]}`).join("\n");
  return `---
id: ${id}
title: ${title}
status: in_progress
${dependsOnLine(dependsOn)}tdd: required
evidence: pending — append the commands run and their results
---

> Living task. Human-owned status: an agent leaves this at \`in_progress\` with real evidence and
> never raises it to \`ready\` or \`done\` itself.

# ${id} — ${title}

## Flow

${phases}

Tick the phases in order and write what each one produced after the colon; \`bun loom check\`
enforces both. No checkpoint is ticked and no ticket starts before design is ticked.

${guide}

## Goal

## Decisions

## Plan

<!-- Split the work into the smallest vertical slices with \`bun loom task:new ${id}.<n> "<title>" --depends-on <ids>\`, then paste \`bun loom task:plan ${id}\` here in a text fence: every ticket in one wave can run in parallel. -->

## Checkpoints

- [ ] **${id}.1** Replace with one verifiable item, or delete these once the work is split into tickets
- [ ] **${id}.2** \`bun loom check\` green

## Evidence

${EVIDENCE_GRAMMAR(id)}
`;
}

export function renderTicket(id: string, title: string, dependsOn: readonly string[]): string {
  const blockers = dependsOn.length > 0 ? dependsOn.map((dep) => `- ${dep}`).join("\n") : "- None";
  return `---
id: ${id}
title: ${title}
status: draft
${dependsOnLine(dependsOn)}tdd: required
evidence: pending — append the commands run and their results
---

> Draft until the owner ticks design and every \`depends_on\` ticket has started; then set
> \`in_progress\`. A human sets \`ready\` and \`done\`.

# ${id} — ${title}

## What to build

## Acceptance criteria

## Blocked by

${blockers}

## Checkpoints

- [ ] **${id}.1** Smallest verifiable step; tick it only after its red and green lines exist

## Evidence

${EVIDENCE_GRAMMAR(id)}
`;
}

const DESIGN_TITLES: Readonly<Record<string, string>> = {
  "system.md": "Design system",
  "database.md": "Database",
  "pages.md": "Pages",
};

/** What each heading must answer; the comment is guidance and never counts as content. */
const HEADING_GUIDE: Readonly<Record<string, string>> = {
  Foundations: "Tokens used from packages/ui: color roles, type scale, spacing, radius, elevation, motion.",
  Components:
    "packages/ui components reused per layer (atoms → molecules → organisms → templates); new components, their layer and props. Read packages/ui/llms.txt first.",
  States: "Loading, empty, error, permission denied, offline and conflict states (docs/ui-states.md).",
  Accessibility: "Focus order, keyboard paths, contrast, reduced motion, screen reader labels.",
  Content: "Locale keys in packages/i18n, copy tone, number, date and currency formats.",
  Entities:
    "Tables and columns with types, nullability and defaults; optimistic locking and soft delete choices (docs/conventions.md).",
  Relationships:
    "Foreign keys, cardinality and on-delete behaviour. Draw them in database.html (diagram-design ER or schema).",
  "Indexes and constraints":
    "Unique, check and foreign key constraints, and the index behind every query in Access patterns.",
  Migrations: "Forward-only migration files (bun loom make:migration), backfills and seeders.",
  "Access patterns": "Each route's queries and its SQL statement budget in http/query-budget.ts.",
  Routes: "URL, file route under apps/web/src/pages, permission, sidebar entry.",
  Layout:
    "Per page: template, sections and hierarchy; wireframe in pages.html (diagram-design) and the screen's design direction JSON. Run impeccable.",
  Data: "Endpoints per page, typed client calls, query keys and invalidation.",
  Interactions: "Forms and validation, confirmations, optimistic locking conflicts, keyboard shortcuts.",
  Responsive: "Breakpoints, touch targets and mobile behaviour.",
};

export function renderDesignDocument(id: string, file: string): string {
  const headings = DESIGN_DOCUMENTS[file] ?? [];
  const sections = headings.map((heading) => `## ${heading}\n\n<!-- ${HEADING_GUIDE[heading] ?? ""} -->\n`).join("\n");
  return `# ${id} — ${DESIGN_TITLES[file] ?? file}

<!-- Fill every section before ticking design, or replace everything under the title with "n/a — <reason>". -->

${sections}`;
}
