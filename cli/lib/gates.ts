import { checkScope } from "../../gates/scope.ts";
import { validateSkills } from "../../gates/skills.ts";
import { loadTasks, validateTasks } from "../../gates/tasks.ts";
import { GateFailure, repoRoot, SKILLS_DIR, TASKS_DIR } from "./repo.ts";

export const CHECK_GATE_COMMANDS: Readonly<Record<string, string>> = {
  agents: "check:agents",
  architecture: "check:architecture",
  ci: "check:ci",
  copy: "check:copy",
  design: "check:design",
  docs: "check:docs",
  language: "check:language",
  migrations: "check:migrations",
  mobile: "check:mobile",
  motion: "check:motion",
  "package-targets": "check:package-targets",
  platform: "check:platform",
  react: "check:react",
  readiness: "check:prod",
  rpc: "check:rpc",
  scope: "check:scope",
  shadcn: "check:shadcn",
  skills: "skills:validate",
  slop: "check:slop",
  surface: "check:surface",
  task: "check:task",
  tdd: "check:tdd",
  ui: "check:ui",
  versioning: "check:versioning",
};

/** Gates read repo files directly — used by `check` and callable on their own. */
export async function runGate(
  kind:
    | "agents"
    | "skills"
    | "task"
    | "tdd"
    | "scope"
    | "slop"
    | "platform"
    | "readiness"
    | "react"
    | "copy"
    | "design"
    | "surface"
    | "shadcn"
    | "ui"
    | "motion"
    | "ci"
    | "rpc"
    | "docs"
    | "architecture"
    | "language"
    | "mobile"
    | "package-targets"
    | "versioning",
): Promise<void> {
  let findings: string[];
  if (kind === "agents") {
    const { checkAgentReadiness } = await import("../../gates/agent-readiness.ts");
    findings = await checkAgentReadiness(repoRoot);
  } else if (kind === "skills") {
    findings = (await validateSkills(SKILLS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "task") {
    findings = validateTasks(await loadTasks(TASKS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "tdd") {
    const { checkTdd } = await import("../../gates/tdd.ts");
    findings = (await checkTdd(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "scope") {
    findings = (await checkScope(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "slop") {
    const { findCodeSlop } = await import("../../gates/slop.ts");
    findings = await findCodeSlop(repoRoot);
  } else if (kind === "platform") {
    const { checkPlatform } = await import("../../gates/platform.ts");
    findings = (await checkPlatform(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "copy") {
    const { checkUserCopy } = await import("../../gates/copy-guard.ts");
    findings = (await checkUserCopy(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — "${f.text}" (${f.why})`);
  } else if (kind === "surface") {
    const { checkInteractiveSurface } = await import("../../gates/interactive-surface.ts");
    findings = (await checkInteractiveSurface(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "design") {
    const { checkDesign } = await import("../../gates/design-gate.ts");
    const { checkContrast } = await import("../../gates/contrast-gate.ts");
    findings = [
      ...(await checkDesign(repoRoot)).map((f) => `${f.screen} ${f.code}/${f.severity} — ${f.detail}`),
      ...(await checkContrast(repoRoot)),
    ];
  } else if (kind === "shadcn") {
    const { checkShadcn } = await import("../../gates/shadcn-guard.ts");
    findings = (await checkShadcn(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "ui") {
    const { checkUiCompleteness } = await import("../../gates/ui-completeness.ts");
    findings = (await checkUiCompleteness(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "motion") {
    const { checkMotion } = await import("../../gates/motion-gate.ts");
    findings = (await checkMotion(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "architecture") {
    const { checkArchitecture } = await import("../../gates/architecture-guard.ts");
    findings = await checkArchitecture(repoRoot);
  } else if (kind === "language") {
    const { checkTechnicalLanguage } = await import("../../gates/language-guard.ts");
    findings = (await checkTechnicalLanguage(repoRoot)).map(
      (f) =>
        `${f.file}: Indonesian term "${f.term}" in ${f.location}; use English for technical names and closed values`,
    );
  } else if (kind === "mobile") {
    const { checkMobile } = await import("../../gates/mobile-gate.ts");
    findings = (await checkMobile(repoRoot)).map((f) => `${f.rule}: ${f.detail}`);
  } else if (kind === "package-targets") {
    const { checkPackageTargets } = await import("../../gates/package-targets.ts");
    findings = await checkPackageTargets(repoRoot);
  } else if (kind === "versioning") {
    const { checkWorkspaceVersions } = await import("../../gates/versioning.ts");
    findings = (await checkWorkspaceVersions(repoRoot)).map(
      (f) => `${f.packageName}: ${f.detail} Found ${f.version}; expected ${f.expected}.`,
    );
  } else if (kind === "docs") {
    const { checkDocs } = await import("../../gates/docs-guard.ts");
    findings = await checkDocs(repoRoot);
  } else if (kind === "rpc") {
    const { checkRpc } = await import("../../gates/rpc-guard.ts");
    findings = await checkRpc(repoRoot);
  } else if (kind === "ci") {
    const { checkCi } = await import("../../gates/ci-guard.ts");
    findings = await checkCi(repoRoot);
  } else {
    const { findReactDoctorIssues } = await import("../../gates/react-doctor.ts");
    findings = await findReactDoctorIssues(repoRoot);
  }
  if (findings.length > 0) throw new GateFailure(findings);
}
