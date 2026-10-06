import { checkScope } from "../gates/scope.ts";
import { validateSkills } from "../gates/skills.ts";
import { loadTasks, validateTasks } from "../gates/tasks.ts";
import { GateFailure, repoRoot, SKILLS_DIR, TASKS_DIR } from "./repo.ts";

export type GateCatalogEntry = {
  /** `check:gate <name>` key; also the name shown in `check` output. */
  readonly name: string;
  /** Registered CLI command that runs this gate on its own. */
  readonly command: string;
  /** Repo-relative module implementing the gate; migrations run inline in cli/commands/check.ts. */
  readonly file: string;
  /** One sentence: what a failure means. */
  readonly summary: string;
};

/**
 * Single source of truth for the gate list. `check:gate --list`, `CHECK_GATE_COMMANDS` and the
 * `check`/`check:fast` runners all derive from this catalog; order defines the `check` run order.
 * Adding a gate means one entry here, its command in `cli/commands/check.ts` and its module.
 * `docs/gates.md` documents the same list for humans.
 */
export const GATE_CATALOG = [
  {
    name: "agents",
    command: "check:agents",
    file: "cli/gates/agent-readiness.ts",
    summary: "Agent skills, the pinned CodeGraph CLI and a complete local index are present.",
  },
  {
    name: "architecture",
    command: "check:architecture",
    file: "cli/gates/architecture-guard.ts",
    summary: "App and shared-UI imports respect the documented atomic and cross-app boundaries.",
  },
  {
    name: "language",
    command: "check:language",
    file: "cli/gates/language-guard.ts",
    summary: "Technical identifiers and enum values are English, not Indonesian.",
  },
  {
    name: "mobile",
    command: "check:mobile",
    file: "cli/gates/mobile-gate.ts",
    summary: "The installed mobile app keeps its Capacitor, entry, offline-SQLite and release contract.",
  },
  {
    name: "versioning",
    command: "check:versioning",
    file: "cli/gates/versioning.ts",
    summary: "Root and workspace packages share one SemVer release version.",
  },
  {
    name: "docs",
    command: "check:docs",
    file: "cli/gates/docs-guard.ts",
    summary: "Local Markdown links resolve and every package guide names its package.",
  },
  {
    name: "rpc",
    command: "check:rpc",
    file: "cli/gates/rpc-guard.ts",
    summary: "Web and mobile call the API through the typed Hono client, never runtime server imports.",
  },
  {
    name: "ci",
    command: "check:ci",
    file: "cli/gates/ci-guard.ts",
    summary: "The CI workflow keeps its required jobs, init step and docs/ci.md.",
  },
  {
    name: "scope",
    command: "check:scope",
    file: "cli/gates/scope.ts",
    summary: "The template carries no client names, business rules or unknown top-level directories.",
  },
  {
    name: "slop",
    command: "check:slop",
    file: "cli/gates/slop.ts",
    summary: "No narrative comments, oversized page components or governance-validator code slop.",
  },
  {
    name: "platform",
    command: "check:platform",
    file: "cli/gates/platform.ts",
    summary: "Runtime code uses Bun; every Node built-in has a documented exemption.",
  },
  {
    name: "copy",
    command: "check:copy",
    file: "cli/gates/copy-guard.ts",
    summary: "User-visible copy avoids infrastructure vocabulary and deployment names.",
  },
  {
    name: "design",
    command: "check:design",
    file: "cli/gates/design-gate.ts",
    summary: "Every screen declares a design direction and passes the text-contrast rules.",
  },
  {
    name: "impeccable",
    command: "check:impeccable",
    file: "cli/gates/impeccable.ts",
    summary: "The pinned design detector finds no AI-slop anti-patterns on any UI surface.",
  },
  {
    name: "ui",
    command: "check:ui",
    file: "cli/gates/ui-completeness.ts",
    summary: "Screens cover list states, visible focus and a working theme switch.",
  },
  {
    name: "motion",
    command: "check:motion",
    file: "cli/gates/motion-gate.ts",
    summary: "Loops and keyframes provide a reduced-motion escape.",
  },
  {
    name: "shadcn",
    command: "check:shadcn",
    file: "cli/gates/shadcn-guard.ts",
    summary: "Controls come from approved registries; native selects, checkboxes and radios are banned.",
  },
  {
    name: "surface",
    command: "check:surface",
    file: "cli/gates/interactive-surface.ts",
    summary: "Transient feedback uses toasts; persistent errors need a reviewed allowlist entry.",
  },
  {
    name: "react",
    command: "check:react",
    file: "cli/gates/react-doctor.ts",
    summary: "React Doctor reports no errors and no high-complexity components.",
  },
  {
    name: "migrations",
    command: "check:migrations",
    file: "cli/commands/check.ts",
    summary: "Migration modules are named NNNN_snake_case.ts.",
  },
  {
    name: "package-targets",
    command: "check:package-targets",
    file: "cli/gates/package-targets.ts",
    summary: "Multi-target packages keep source under src/<target>/.",
  },
  {
    name: "skills",
    command: "skills:validate",
    file: "cli/gates/skills.ts",
    summary: "Every skill has frontmatter whose name matches its directory and a trigger description.",
  },
  {
    name: "task",
    command: "check:task",
    file: "cli/gates/tasks.ts",
    summary: "docs/tasks front matter uses valid statuses and records evidence for human-approved states.",
  },
  {
    name: "tdd",
    command: "check:tdd",
    file: "cli/gates/tdd.ts",
    summary: "Every server feature ships at least one test under tests/features/<name>/.",
  },
  {
    name: "readiness",
    command: "check:prod",
    file: "cli/gates/readiness.ts",
    summary: "Production prerequisites: scripts, secret placeholders, migration numbering and contract docs.",
  },
] as const satisfies readonly GateCatalogEntry[];

export type GateName = (typeof GATE_CATALOG)[number]["name"];

/** Gate name to standalone command; `check:gate <name>` forwards to it. */
export const CHECK_GATE_COMMANDS: Readonly<Record<string, string>> = Object.fromEntries(
  GATE_CATALOG.map(({ name, command }) => [name, command]),
);

/** Gates read repo files directly — used by `check` and callable on their own. */
export async function runGate(kind: GateName): Promise<void> {
  let findings: string[];
  if (kind === "agents") {
    const { checkAgentReadiness } = await import("../gates/agent-readiness.ts");
    findings = await checkAgentReadiness(repoRoot);
  } else if (kind === "skills") {
    findings = (await validateSkills(SKILLS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "task") {
    findings = validateTasks(await loadTasks(TASKS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "tdd") {
    const { checkTdd } = await import("../gates/tdd.ts");
    findings = (await checkTdd(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "scope") {
    findings = (await checkScope(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "slop") {
    const { findCodeSlop } = await import("../gates/slop.ts");
    findings = await findCodeSlop(repoRoot);
  } else if (kind === "platform") {
    const { checkPlatform } = await import("../gates/platform.ts");
    findings = (await checkPlatform(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "copy") {
    const { checkUserCopy } = await import("../gates/copy-guard.ts");
    findings = (await checkUserCopy(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — "${f.text}" (${f.why})`);
  } else if (kind === "surface") {
    const { checkInteractiveSurface } = await import("../gates/interactive-surface.ts");
    findings = (await checkInteractiveSurface(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "design") {
    const { checkDesign } = await import("../gates/design-gate.ts");
    const { checkContrast } = await import("../gates/contrast-gate.ts");
    findings = [
      ...(await checkDesign(repoRoot)).map((f) => `${f.screen} ${f.code}/${f.severity} — ${f.detail}`),
      ...(await checkContrast(repoRoot)),
    ];
  } else if (kind === "impeccable") {
    const { checkImpeccable } = await import("../gates/impeccable.ts");
    findings = await checkImpeccable(repoRoot);
  } else if (kind === "shadcn") {
    const { checkShadcn } = await import("../gates/shadcn-guard.ts");
    findings = (await checkShadcn(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "ui") {
    const { checkUiCompleteness } = await import("../gates/ui-completeness.ts");
    findings = (await checkUiCompleteness(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "motion") {
    const { checkMotion } = await import("../gates/motion-gate.ts");
    findings = (await checkMotion(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "architecture") {
    const { checkArchitecture } = await import("../gates/architecture-guard.ts");
    findings = await checkArchitecture(repoRoot);
  } else if (kind === "language") {
    const { checkTechnicalLanguage } = await import("../gates/language-guard.ts");
    findings = (await checkTechnicalLanguage(repoRoot)).map(
      (f) =>
        `${f.file}: Indonesian term "${f.term}" in ${f.location}; use English for technical names and closed values`,
    );
  } else if (kind === "mobile") {
    const { checkMobile } = await import("../gates/mobile-gate.ts");
    findings = (await checkMobile(repoRoot)).map((f) => `${f.rule}: ${f.detail}`);
  } else if (kind === "package-targets") {
    const { checkPackageTargets } = await import("../gates/package-targets.ts");
    findings = await checkPackageTargets(repoRoot);
  } else if (kind === "versioning") {
    const { checkWorkspaceVersions } = await import("../gates/versioning.ts");
    findings = (await checkWorkspaceVersions(repoRoot)).map(
      (f) => `${f.packageName}: ${f.detail} Found ${f.version}; expected ${f.expected}.`,
    );
  } else if (kind === "docs") {
    const { checkDocs } = await import("../gates/docs-guard.ts");
    findings = await checkDocs(repoRoot);
  } else if (kind === "rpc") {
    const { checkRpc } = await import("../gates/rpc-guard.ts");
    findings = await checkRpc(repoRoot);
  } else if (kind === "ci") {
    const { checkCi } = await import("../gates/ci-guard.ts");
    findings = await checkCi(repoRoot);
  } else {
    const { findReactDoctorIssues } = await import("../gates/react-doctor.ts");
    findings = await findReactDoctorIssues(repoRoot);
  }
  if (findings.length > 0) throw new GateFailure(findings);
}
