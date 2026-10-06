import { join } from "node:path";
import { checkScope } from "../gates/scope.ts";
import { validateSkills } from "../gates/skills.ts";
import { loadTasks, validateTasks } from "../gates/tasks.ts";
import { GateFailure, repoRoot } from "./repo.ts";

export type GateCatalogEntry = {
  /** `check:gate <name>` key; also the name shown in `check` output. */
  readonly name: string;
  /** Registered CLI command that runs this gate on its own. */
  readonly command: string;
  /** Repo-relative module implementing the gate. */
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
    file: "cli/gates/migrations.ts",
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

type GateImplementation = (root: string) => Promise<string[]>;

/**
 * Catalog-driven dispatch: every `GATE_CATALOG` name maps to a lazy loader for its implementation.
 * `Record<GateName, GateImplementation>` makes a missing entry a type error, so a gate can never
 * silently fall through to another gate's runner. Exported so the dispatch test asserts the same
 * mapping at runtime.
 */
export const GATE_IMPLEMENTATIONS: Readonly<Record<GateName, GateImplementation>> = {
  agents: async (root) => (await import("../gates/agent-readiness.ts")).checkAgentReadiness(root),
  architecture: async (root) => (await import("../gates/architecture-guard.ts")).checkArchitecture(root),
  language: async (root) => {
    const { checkTechnicalLanguage } = await import("../gates/language-guard.ts");
    return (await checkTechnicalLanguage(root)).map(
      (f) =>
        `${f.file}: Indonesian term "${f.term}" in ${f.location}; use English for technical names and closed values`,
    );
  },
  mobile: async (root) => {
    const { checkMobile } = await import("../gates/mobile-gate.ts");
    return (await checkMobile(root)).map((f) => `${f.rule}: ${f.detail}`);
  },
  versioning: async (root) => {
    const { checkWorkspaceVersions } = await import("../gates/versioning.ts");
    return (await checkWorkspaceVersions(root)).map(
      (f) => `${f.packageName}: ${f.detail} Found ${f.version}; expected ${f.expected}.`,
    );
  },
  docs: async (root) => (await import("../gates/docs-guard.ts")).checkDocs(root),
  rpc: async (root) => (await import("../gates/rpc-guard.ts")).checkRpc(root),
  ci: async (root) => (await import("../gates/ci-guard.ts")).checkCi(root),
  scope: async (root) => (await checkScope(root)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`),
  slop: async (root) => (await import("../gates/slop.ts")).findCodeSlop(root),
  platform: async (root) => {
    const { checkPlatform } = await import("../gates/platform.ts");
    return (await checkPlatform(root)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  },
  copy: async (root) => {
    const { checkUserCopy } = await import("../gates/copy-guard.ts");
    return (await checkUserCopy(root)).map((f) => `${f.file}:${f.line} ${f.rule} — "${f.text}" (${f.why})`);
  },
  design: async (root) => {
    const { checkDesign } = await import("../gates/design-gate.ts");
    const { checkContrast } = await import("../gates/contrast-gate.ts");
    return [
      ...(await checkDesign(root)).map((f) => `${f.screen} ${f.code}/${f.severity} — ${f.detail}`),
      ...(await checkContrast(root)),
    ];
  },
  impeccable: async (root) => (await import("../gates/impeccable.ts")).checkImpeccable(root),
  ui: async (root) => {
    const { checkUiCompleteness } = await import("../gates/ui-completeness.ts");
    return (await checkUiCompleteness(root)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  },
  motion: async (root) => {
    const { checkMotion } = await import("../gates/motion-gate.ts");
    return (await checkMotion(root)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  },
  shadcn: async (root) => {
    const { checkShadcn } = await import("../gates/shadcn-guard.ts");
    return (await checkShadcn(root)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  },
  surface: async (root) => {
    const { checkInteractiveSurface } = await import("../gates/interactive-surface.ts");
    return (await checkInteractiveSurface(root)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  },
  react: async (root) => (await import("../gates/react-doctor.ts")).findReactDoctorIssues(root),
  migrations: async (root) => (await import("../gates/migrations.ts")).checkMigrations(root),
  "package-targets": async (root) => (await import("../gates/package-targets.ts")).checkPackageTargets(root),
  skills: async (root) => (await validateSkills(join(root, "skills"))).map((f) => `${f.file}: ${f.message}`),
  task: async (root) => validateTasks(await loadTasks(join(root, "docs/tasks"))).map((f) => `${f.file}: ${f.message}`),
  tdd: async (root) => {
    const { checkTdd } = await import("../gates/tdd.ts");
    return (await checkTdd(root)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  },
  readiness: async (root) => {
    const { checkReadiness } = await import("../gates/readiness.ts");
    return (await checkReadiness(root)).map((f) => `${f.rule}: ${f.detail}`);
  },
};

/** Run a catalog gate against `root` and return its findings without throwing or exiting. */
export async function collectGateFindings(kind: GateName, root: string = repoRoot): Promise<string[]> {
  const implementation = GATE_IMPLEMENTATIONS[kind];
  if (!implementation) throw new Error(`Gate "${kind}" has no implementation in GATE_IMPLEMENTATIONS.`);
  return implementation(root);
}

/** Gates read repo files directly — used by `check` and callable on their own. */
export async function runGate(kind: GateName, root: string = repoRoot): Promise<void> {
  const findings = await collectGateFindings(kind, root);
  if (findings.length > 0) throw new GateFailure(findings);
}
