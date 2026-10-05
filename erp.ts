/**
 * Thin CLI wrapper (PRD §11). Commands call the same modules as the runtime —
 * the CLI keeps no logic of its own.
 */
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { createContext } from "./apps/server/bootstrap.ts";
import { resolveDefaultOrganizationId } from "./apps/server/context.ts";
import { recordAudit, snapshot } from "./apps/server/features/audit/service.ts";
import { accounts, users } from "./apps/server/features/identity/schema.ts";
import {
  createUser,
  deleteUser,
  hashPassword,
  replaceUserRoles,
  revokeUserRole,
  updateUser,
} from "./apps/server/features/identity/service.ts";
import { createUserSchema, updateUserSchema } from "./apps/server/features/identity/validation.ts";
import { createJobRegistry } from "./apps/server/features/jobs.ts";
import { roles as roleTable } from "./apps/server/features/rbac/schema.ts";
import {
  assignRole,
  createRole,
  deleteRole,
  findRoleByKey,
  permissionsForRole,
  permissionsForUser,
  rolesForUser,
  setRolePermissions,
  updateRole,
} from "./apps/server/features/rbac/service.ts";
import { createRoleSchema, updateRoleSchema } from "./apps/server/features/rbac/validation.ts";
import { createApp } from "./apps/server/http/app.ts";
import { loadEnv, strayKeyWarnings } from "./apps/server/platform/config/index.ts";
import type { Database } from "./apps/server/platform/database/index.ts";
import { migrate, rowsOf } from "./apps/server/platform/database/migrate.ts";
import { organizations } from "./apps/server/platform/database/schema.ts";
import { seed } from "./apps/server/platform/database/seed.ts";
import { requeueDeadJob, runJobBatch } from "./apps/server/platform/jobs/queue.ts";
import { startJobWorker } from "./apps/server/platform/jobs/worker.ts";
import {
  listWorkspaceApps,
  readWorkspaceApp,
  registerWorkspace,
  renderAppScaffold,
  type WorkspaceApp,
} from "./tools/apps.ts";
import {
  addAuditEntity,
  addRouteMount,
  addStatementResource,
  nextMigrationFile,
  parseMigrationName,
  renderFeatureScaffold,
  renderMigrationSource,
  renderSeederSource,
  toSeederName,
  toSnakeName,
} from "./tools/scaffolding.ts";
import { checkScope } from "./tools/scope.ts";
import { validateSkills } from "./tools/skills.ts";
import { loadTasks, validateTasks } from "./tools/tasks.ts";

const repoRoot = resolve(import.meta.dir);
const MIGRATIONS_DIR = resolve(repoRoot, "apps/server/migrations");
const SEEDERS_DIR = resolve(repoRoot, "apps/server/seeders");
const TASKS_DIR = resolve(repoRoot, "docs/tasks");
const SKILLS_DIR = resolve(repoRoot, "skills");

const CHECK_GATE_COMMANDS: Readonly<Record<string, string>> = {
  agents: "check:agents",
  architecture: "check:architecture",
  ci: "check:ci",
  copy: "check:copy",
  design: "check:design",
  docs: "check:docs",
  language: "check:language",
  migrations: "check:migrations",
  mobile: "check:mobile",
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
  ui: "check:ui",
  versioning: "check:versioning",
};

const HELP_GROUPS: ReadonlyArray<{
  title: string;
  commands: ReadonlyArray<readonly [name: string, description: string]>;
}> = [
  {
    title: "Project",
    commands: [
      ["init", "Install the project agent tooling"],
      ["doctor", "Check local environment and database readiness"],
      ["dev", "Start the web app with API and Vite HMR"],
      ["build", "Build the target selected by APP_DEPLOY_TARGET"],
      ["preview", "Preview the built web app"],
      ["server:api", "Run the API without serving web assets"],
    ],
  },
  {
    title: "Quality",
    commands: [
      ["check", "Run all code, type, and project gates in parallel"],
      ["check:prod", "Check production deployment readiness"],
      ["check:gate <name>", "Run one focused gate; use --list to see names"],
      ["test", "Run backend, web, mobile, and package test suites"],
    ],
  },
  {
    title: "Generators",
    commands: [
      ["make:feature <name>", "Create a CRUD feature, its test, and its create-table migration"],
      ["make:migration <name>", "Create a numbered migration; create_x_table fills the table name"],
      ["make:seeder <name>", "Create an idempotent feature seeder scaffold"],
    ],
  },
  {
    title: "Apps",
    commands: [
      ["apps", "List workspace apps with build, port, and test status"],
      ["apps:list", "List workspace apps (same as bun erp apps)"],
      ["apps:status <name>", "Show build, port, script, and environment info for one app"],
      ["apps:create <name>", "Create a minimal Bun workspace app under apps/"],
    ],
  },
  {
    title: "Database",
    commands: [
      ["db:migrate", "Apply pending TypeScript migrations"],
      ["db:status", "Show applied and pending migrations"],
      ["db:seed [seeder]", "Seed infrastructure and feature data"],
    ],
  },
  {
    title: "Application",
    commands: [
      ["route:list", "List routes from the assembled Hono app"],
      ["env:list", "Show safe configuration values and warnings"],
      ["key:generate", "Generate the local authentication secret"],
      ["role:list", "List available role keys for this organization"],
      ["role:show <key>", "Show one role with its permissions"],
      ["role:create <key> [--name] [--description] [--permissions a,b]", "Create a custom role"],
      [
        "role:edit <key> [--name] [--description] [--permissions a,b]",
        "Update a role; --permissions replaces the whole set",
      ],
      ["role:delete <key> --force", "Delete a custom role"],
      ["user:list", "List users and their roles"],
      ["user:show <email>", "Show one user with roles and permissions"],
      ["user:create <email> <password> [--role <key>] [--name <name>]", "Create a user in the configured database"],
      ["user:edit <email> [--name] [--verified] [--roles a,b]", "Update a profile or replace organization-wide roles"],
      ["user:delete <email> --force", "Delete a user"],
      ["user:grant <email> [roleKey]", "Grant a role to a user"],
      ["user:revoke <email> <roleKey>", "Revoke a role from a user"],
      ["user:passwd <email> [password]", "Reset a user's password"],
    ],
  },
  {
    title: "Background jobs",
    commands: [
      ["jobs:work", "Run the long-lived job worker"],
      ["jobs:run-once", "Process one bounded batch"],
      ["jobs:status", "Show queue counts"],
      ["jobs:dead", "List jobs that reached terminal failure"],
      ["jobs:retry", "Requeue a dead job by ID"],
    ],
  },
  {
    title: "Cloudflare",
    commands: [
      ["cloudflare:dev", "Run the Worker locally"],
      ["cloudflare:build", "Build the single Worker and static assets"],
      ["cloudflare:deploy", "Build and deploy to Cloudflare Workers"],
    ],
  },
  {
    title: "Mobile",
    commands: [
      ["mobile:dev", "Run the mobile web app with HMR"],
      ["mobile:preview", "Preview the mobile web build"],
      ["mobile:build", "Build mobile web assets"],
      ["mobile:package", "Build a native mobile package; --mode debug|production (default production)"],
      ["mobile:version", "Stamp native version and build number"],
      ["mobile:add", "Add a native Capacitor platform"],
      ["mobile:sync", "Sync web assets to native projects"],
      ["mobile:open", "Open a native project in its IDE"],
    ],
  },
  {
    title: "CI support",
    commands: [
      ["ci:prepare", "Prepare the CI database and owner"],
      ["ci:owner", "Create the CI owner account"],
      ["wait:http", "Wait for an HTTP endpoint to become available"],
    ],
  },
];

/** A failing subprocess must stop the gate — not merely be logged and skipped. */
async function run(argv: readonly string[], label: string): Promise<void> {
  const proc = Bun.spawn([...argv], { cwd: repoRoot, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    process.stderr.write(`${label} failed with exit ${code}\n`);
    process.exit(code);
  }
}

function deploymentTarget(): "bun" | "cloudflare" {
  const target = process.env.APP_DEPLOY_TARGET ?? "bun";
  if (target !== "bun" && target !== "cloudflare") {
    throw new Error(`Unsupported APP_DEPLOY_TARGET=${target}. Implemented targets: bun, cloudflare.`);
  }
  return target;
}

async function buildCloudflare(): Promise<void> {
  const webMode = process.env.APP_WEB_MODE ?? "integrated";
  if (webMode !== "integrated") {
    throw new Error("Cloudflare currently requires APP_WEB_MODE=integrated.");
  }

  const generatedLocalBindings = resolve(repoRoot, "apps/web/dist/bun_erp_template/.dev.vars");
  try {
    await run(["bun", "run", "--cwd", "apps/web", "build:cloudflare"], "Cloudflare Worker build");
  } finally {
    // The Vite plugin can materialize values from a local .env for development; they never belong in deploy output.
    await Bun.$`rm -f ${generatedLocalBindings}`.quiet();
  }
}

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof GateFailure) {
      process.stderr.write(`${label} failed:\n${err.findings.map((f) => `  ${f}`).join("\n")}\n`);
      process.exit(1);
    }
    throw err;
  }
}

class GateFailure extends Error {
  readonly findings: string[];
  constructor(findings: string[]) {
    super(`${findings.length} finding(s)`);
    this.findings = findings;
  }
}

type CommandOptions = {
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
};

/**
 * Minimal artisan-style parser: `--flag`, `--key value`, and `--key=value`.
 * Unknown options fail loudly, so a typo never silently drops operator input.
 */
function parseCommandOptions(
  args: readonly string[],
  spec: { flags?: readonly string[]; values?: readonly string[] },
): CommandOptions {
  const knownFlags = new Set(spec.flags ?? []);
  const knownValues = new Set(spec.values ?? []);
  const parsed: CommandOptions = { positional: [], flags: new Set(), values: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (key && knownFlags.has(key)) {
      if (inlineValue !== undefined) throw new Error(`--${key} does not take a value`);
      parsed.flags.add(key);
      continue;
    }
    if (key && knownValues.has(key)) {
      const value = inlineValue ?? args[index + 1];
      if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
        throw new Error(`--${key} requires a value`);
      }
      parsed.values.set(key, value);
      if (inlineValue === undefined) index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function cliActor(): { userId: null; traceId: string; label: string } {
  return { userId: null, traceId: `cli-${Date.now()}`, label: "cli" };
}

function humanizeKey(key: string): string {
  return key
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function parseKeyList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.map(String).join(".") || "input"}: ${issue.message}`).join("\n");
}

async function requireRoleByKey(db: Database, organizationId: string, key: string) {
  const role = await findRoleByKey(db, organizationId, key);
  if (role) return role;
  const available = await db
    .select({ key: roleTable.key })
    .from(roleTable)
    .where(eq(roleTable.organizationId, organizationId))
    .orderBy(roleTable.key);
  throw new Error(
    `No role "${key}" in this organization. Available: ${available.map((row) => row.key).join(", ") || "none"}. Run bun erp role:list.`,
  );
}

async function requireUserByEmail(db: Database, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) throw new Error(`No user with email ${email}. Run bun erp user:list.`);
  return user;
}

function formatTimestamp(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "unknown";
}

async function envKeyCount(path: string): Promise<number | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return (await file.text()).split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).length;
}

function printAppTable(apps: WorkspaceApp[]): void {
  const headers = ["app", "package", "version", "port", "build", "tests"];
  const rows = apps.map((app) => [
    app.name,
    app.packageName,
    app.version,
    app.port ? String(app.port) : "—",
    app.buildDir ? `built (${app.buildDir})` : "not built",
    app.testFiles > 0 ? String(app.testFiles) : "—",
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  process.stdout.write(`${headers.map((header, index) => header.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  for (const row of rows) {
    process.stdout.write(`${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  }
}

async function showApps(): Promise<void> {
  const apps = await listWorkspaceApps(repoRoot);
  if (apps.length === 0) {
    process.stdout.write("No workspace apps found. Create one with bun erp apps:create <name>.\n");
    return;
  }
  printAppTable(apps);
}

/** Gates read repo files directly — used by `check` and callable on their own. */
async function runGate(
  kind:
    | "agents"
    | "skills"
    | "task"
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
    | "ci"
    | "rpc"
    | "docs"
    | "architecture"
    | "language"
    | "mobile"
    | "versioning",
): Promise<void> {
  let findings: string[];
  if (kind === "agents") {
    const { checkAgentReadiness } = await import("./tools/agent-readiness.ts");
    findings = await checkAgentReadiness(repoRoot);
  } else if (kind === "skills") {
    findings = (await validateSkills(SKILLS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "task") {
    findings = validateTasks(await loadTasks(TASKS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "scope") {
    findings = (await checkScope(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "slop") {
    const { findCodeSlop } = await import("./tools/slop.ts");
    findings = await findCodeSlop(repoRoot);
  } else if (kind === "platform") {
    const { checkPlatform } = await import("./tools/platform.ts");
    findings = (await checkPlatform(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "copy") {
    const { checkUserCopy } = await import("./tools/copy-guard.ts");
    findings = (await checkUserCopy(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — "${f.text}" (${f.why})`);
  } else if (kind === "surface") {
    const { checkInteractiveSurface } = await import("./tools/interactive-surface.ts");
    findings = (await checkInteractiveSurface(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "design") {
    const { checkDesign } = await import("./tools/design-gate.ts");
    const { checkContrast } = await import("./tools/contrast-gate.ts");
    findings = [
      ...(await checkDesign(repoRoot)).map((f) => `${f.screen} ${f.code}/${f.severity} — ${f.detail}`),
      ...(await checkContrast(repoRoot)),
    ];
  } else if (kind === "shadcn") {
    const { checkShadcn } = await import("./tools/shadcn-guard.ts");
    findings = (await checkShadcn(repoRoot)).map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  } else if (kind === "ui") {
    const { checkUiCompleteness } = await import("./tools/ui-completeness.ts");
    findings = (await checkUiCompleteness(repoRoot)).map((f) => `${f.file} ${f.rule} — ${f.detail}`);
  } else if (kind === "architecture") {
    const { checkArchitecture } = await import("./tools/architecture-guard.ts");
    findings = await checkArchitecture(repoRoot);
  } else if (kind === "language") {
    const { checkTechnicalLanguage } = await import("./tools/language-guard.ts");
    findings = (await checkTechnicalLanguage(repoRoot)).map(
      (f) =>
        `${f.file}: Indonesian term "${f.term}" in ${f.location}; use English for technical names and closed values`,
    );
  } else if (kind === "mobile") {
    const { checkMobile } = await import("./tools/mobile-gate.ts");
    findings = (await checkMobile(repoRoot)).map((f) => `${f.rule}: ${f.detail}`);
  } else if (kind === "versioning") {
    const { checkWorkspaceVersions } = await import("./tools/versioning.ts");
    findings = (await checkWorkspaceVersions(repoRoot)).map(
      (f) => `${f.packageName}: ${f.detail} Found ${f.version}; expected ${f.expected}.`,
    );
  } else if (kind === "docs") {
    const { checkDocs } = await import("./tools/docs-guard.ts");
    findings = await checkDocs(repoRoot);
  } else if (kind === "rpc") {
    const { checkRpc } = await import("./tools/rpc-guard.ts");
    findings = await checkRpc(repoRoot);
  } else if (kind === "ci") {
    const { checkCi } = await import("./tools/ci-guard.ts");
    findings = await checkCi(repoRoot);
  } else {
    const { findReactDoctorIssues } = await import("./tools/react-doctor.ts");
    findings = await findReactDoctorIssues(repoRoot);
  }
  if (findings.length > 0) throw new GateFailure(findings);
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
  init: async () => {
    await run(["bun", "scripts/init-agents.ts"], "initialize project agent tooling");
  },
  apps: async () => {
    await showApps();
  },
  "apps:list": async () => {
    await showApps();
  },
  "apps:status": async (args) => {
    const parsed = parseCommandOptions(args, {});
    const name = parsed.positional[0];
    if (!name) {
      process.stderr.write("Usage: bun erp apps:status <name>\n");
      process.exit(1);
    }
    const app = await readWorkspaceApp(repoRoot, name);
    if (!app) throw new Error(`Unknown app "${name}". Run bun erp apps to list workspace apps.`);
    process.stdout.write(`app:        ${app.name}\n`);
    process.stdout.write(`path:       ${app.dir}\n`);
    process.stdout.write(`package:    ${app.packageName}\n`);
    process.stdout.write(`version:    ${app.version}\n`);
    process.stdout.write(`private:    ${app.private ? "yes" : "no"}\n`);
    process.stdout.write(`entry:      ${app.entry ?? "—"}\n`);
    process.stdout.write(`dev port:   ${app.port ? `${app.port} (${app.portSource})` : "—"}\n`);
    process.stdout.write(
      app.buildDir
        ? `build:      ${app.dir}/${app.buildDir} (updated ${formatTimestamp(app.buildUpdatedAt)})\n`
        : "build:      not built\n",
    );
    process.stdout.write(
      app.testDir ? `tests:      ${app.dir}/${app.testDir} (${app.testFiles} file(s))\n` : "tests:      none\n",
    );
    process.stdout.write(`scripts:    ${Object.keys(app.scripts).join(", ") || "—"}\n`);
    const appEnv = await envKeyCount(resolve(repoRoot, app.dir, ".env.example"));
    const rootEnv = appEnv === undefined ? await envKeyCount(resolve(repoRoot, ".env.example")) : undefined;
    const envLabel =
      appEnv !== undefined
        ? `${app.dir}/.env.example (${appEnv} key(s))`
        : rootEnv !== undefined
          ? `.env.example (${rootEnv} key(s))`
          : "no .env.example";
    process.stdout.write(`env:        ${envLabel}\n`);
  },
  "apps:create": async (args) => {
    const rawName = args[0];
    if (!rawName || rawName.startsWith("--")) {
      process.stderr.write("Usage: bun erp apps:create <name>\n");
      process.exit(1);
    }
    const rootManifest = (await Bun.file(resolve(repoRoot, "package.json")).json()) as { version?: string };
    const scaffold = renderAppScaffold(rawName, { version: rootManifest.version ?? "0.1.0" });
    if (await Bun.file(resolve(repoRoot, scaffold.dir, "package.json")).exists()) {
      throw new Error(`App already exists: ${scaffold.dir}`);
    }
    for (const file of scaffold.files) await writeScaffold(resolve(repoRoot, file.path), file.contents);
    await formatScaffold(scaffold.files.map((file) => file.path));
    const manifestPath = resolve(repoRoot, "package.json");
    const registered = registerWorkspace(await Bun.file(manifestPath).text(), scaffold.dir);
    if (registered.status === "added") await Bun.write(manifestPath, registered.source);
    process.stdout.write(`Created app: ${scaffold.dir}\n`);
    for (const file of scaffold.files) process.stdout.write(`  ${file.path}\n`);
    process.stdout.write(
      registered.status === "added"
        ? `Registered workspace: ${scaffold.dir}\n`
        : `Add "${scaffold.dir}" to the workspaces array in package.json\n`,
    );
    process.stdout.write(`Next: run bun install, then bun run --cwd ${scaffold.dir} dev\n`);
  },
  "check:gate": async (args) => {
    const [name, ...forwardedArgs] = args;
    if (name === "--list" || name === "list") {
      process.stdout.write(`Available gates: ${Object.keys(CHECK_GATE_COMMANDS).sort().join(", ")}\n`);
      return;
    }
    if (!name) {
      process.stderr.write(
        "Usage: bun erp check:gate <name>\nRun `bun erp check:gate --list` to list available gates.\n",
      );
      process.exit(1);
    }
    const legacyCommand = CHECK_GATE_COMMANDS[name];
    if (!legacyCommand) {
      process.stderr.write(
        `Unknown check gate: ${name}. Available: ${Object.keys(CHECK_GATE_COMMANDS).sort().join(", ")}\n`,
      );
      process.exit(1);
    }
    const handler = commands[legacyCommand];
    if (!handler) throw new Error(`Check gate command is not registered: ${legacyCommand}`);
    await handler(forwardedArgs);
  },
  "check:mobile": async () => {
    await guard("mobile", () => runGate("mobile"));
    process.stdout.write("Mobile contract OK.\n");
  },
  "check:agents": async () => {
    await guard("agent prerequisites", () => runGate("agents"));
    process.stdout.write("Agent skills and CodeGraph index OK.\n");
  },
  "check:versioning": async () => {
    await guard("versioning", () => runGate("versioning"));
    process.stdout.write("Workspace versions OK.\n");
  },
  "make:feature": async (args) => {
    const rawName = args[0];
    if (!rawName || rawName.startsWith("--")) {
      process.stderr.write("Usage: bun erp make:feature <name>\n");
      process.exit(1);
    }
    const scaffold = renderFeatureScaffold(rawName);
    for (const file of scaffold.files) {
      const path = resolve(repoRoot, file.path);
      if (await Bun.file(path).exists()) throw new Error(`Refusing to overwrite existing file: ${file.path}`);
    }

    const existing = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })];
    const migrationFile = nextMigrationFile(existing, `create_${scaffold.table}_table`);
    for (const file of scaffold.files) await writeScaffold(resolve(repoRoot, file.path), file.contents);
    const migrationPath = `apps/server/migrations/${migrationFile}`;
    await writeScaffold(
      resolve(MIGRATIONS_DIR, migrationFile),
      renderMigrationSource({ mode: "create", table: scaffold.table }),
    );

    const statementsPath = "apps/server/features/rbac/statements.ts";
    const statements = addStatementResource(
      await Bun.file(resolve(repoRoot, statementsPath)).text(),
      scaffold.resource,
    );
    if (statements.status === "added") await Bun.write(resolve(repoRoot, statementsPath), statements.source);
    const auditPath = "apps/server/features/audit/redact.ts";
    const audit = addAuditEntity(await Bun.file(resolve(repoRoot, auditPath)).text(), scaffold.resource);
    if (audit.status === "added") await Bun.write(resolve(repoRoot, auditPath), audit.source);
    const routesPath = "apps/server/http/routes.ts";
    const routes = addRouteMount(await Bun.file(resolve(repoRoot, routesPath)).text(), scaffold);
    if (routes.status === "added") await Bun.write(resolve(repoRoot, routesPath), routes.source);

    // Wiring edits happen after the scaffold is written, so format every touched file together or lint fails.
    const touched = [
      [statementsPath, statements.status],
      [auditPath, audit.status],
      [routesPath, routes.status],
    ]
      .filter(([, status]) => status === "added")
      .map(([path]) => path as string);
    await formatScaffold([...scaffold.files.map((file) => file.path), migrationPath, ...touched]);

    process.stdout.write(`Created feature: apps/server/features/${scaffold.name}\n`);
    for (const file of scaffold.files) process.stdout.write(`  ${file.path}\n`);
    process.stdout.write(`Created migration: apps/server/migrations/${migrationFile}\n`);
    if (statements.status === "added") {
      process.stdout.write(`Registered permissions: ${scaffold.resource}.create, read, update, delete\n`);
    } else if (statements.status === "present") {
      process.stdout.write(`Permissions already registered: ${scaffold.resource}.*\n`);
    } else {
      process.stdout.write(
        `Register the ${scaffold.resource}.* permissions in apps/server/features/rbac/statements.ts\n`,
      );
    }
    if (audit.status === "added") {
      process.stdout.write(`Registered audit entity: ${scaffold.resource}\n`);
    } else if (audit.status === "skipped") {
      process.stdout.write(`Register the ${scaffold.resource} audit fields in apps/server/features/audit/redact.ts\n`);
    }
    if (routes.status === "added") {
      process.stdout.write(`Mounted routes: /api/v1/${scaffold.name}\n`);
    } else if (routes.status === "present") {
      process.stdout.write(`Routes already mounted: /api/v1/${scaffold.name}\n`);
    } else {
      process.stdout.write(
        `Mount ${scaffold.camel}Routes under /api/v1/${scaffold.name} in apps/server/http/routes.ts\n`,
      );
    }
    process.stdout.write("Next: add the domain fields, then run bun erp db:migrate && bun erp db:seed.\n");
  },
  "make:migration": async (args) => {
    const parsed = parseCommandOptions(args, { values: ["create", "table"] });
    const rawName = parsed.positional[0];
    if (!rawName) {
      process.stderr.write("Usage: bun erp make:migration <name> [--create <table>] [--table <table>]\n");
      process.exit(1);
    }
    if (parsed.values.has("create") && parsed.values.has("table")) {
      throw new Error("Use either --create or --table, not both");
    }
    const intent = parsed.values.has("create")
      ? { mode: "create" as const, table: toSnakeName(parsed.values.get("create") ?? "") }
      : parsed.values.has("table")
        ? { mode: "alter" as const, table: toSnakeName(parsed.values.get("table") ?? "") }
        : parseMigrationName(rawName);
    const existing = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })];
    const file = nextMigrationFile(existing, rawName);
    await writeScaffold(resolve(MIGRATIONS_DIR, file), renderMigrationSource(intent));
    process.stdout.write(`Created migration scaffold: apps/server/migrations/${file}\n`);
    process.stdout.write(
      intent.mode === "stub"
        ? "Implement its forward-only schema change before running bun erp db:migrate.\n"
        : "Fill in the domain columns and indexes, then run bun erp db:migrate.\n",
    );
  },
  "make:seeder": async (args) => {
    const rawName = args[0];
    if (!rawName || rawName.startsWith("--")) {
      process.stderr.write("Usage: bun erp make:seeder <name>\n");
      process.exit(1);
    }
    const name = toSeederName(rawName);
    const target = resolve(SEEDERS_DIR, `${name}.ts`);
    await writeScaffold(target, renderSeederSource(name));
    process.stdout.write(`Created seeder scaffold: apps/server/seeders/${name}.ts\n`);
    process.stdout.write("`bun erp db:seed` runs all feature seeders; add deterministic, idempotent data first.\n");
  },
  "check:language": async () => {
    await guard("language", () => runGate("language"));
    process.stdout.write("Technical language OK.\n");
  },
  "check:architecture": async () => {
    await guard("architecture", () => runGate("architecture"));
  },
  "check:docs": async () => {
    await guard("docs", () => runGate("docs"));
  },
  "check:rpc": async () => {
    await guard("rpc", () => runGate("rpc"));
  },
  "check:ci": async () => {
    await guard("ci", () => runGate("ci"));
  },
  "ci:prepare": async () => {
    await run(["bun", "scripts/ci-prepare.ts"], "prepare CI");
  },
  "ci:owner": async () => {
    await run(["bun", "scripts/ci-owner.ts"], "create CI owner");
  },
  "wait:http": async (args) => {
    await run(["bun", "scripts/wait-http.ts", ...args], "wait for HTTP");
  },
  "mobile:dev": async () => {
    await run(["bun", "run", "--cwd", "apps/mobile", "dev"], "mobile dev");
  },
  "mobile:preview": async () => {
    await run(["bun", "run", "--cwd", "apps/mobile", "preview"], "mobile preview");
  },
  "mobile:build": async () => {
    await run(["bun", "scripts/mobile.ts", "build"], "mobile build");
  },
  "mobile:package": async (args) => {
    await run(["bun", "scripts/mobile.ts", "package", ...args], "mobile native package");
  },
  "mobile:version": async (args) => {
    await run(["bun", "scripts/mobile-version.ts", ...args], "stamp mobile version");
  },
  "mobile:add": async (args) => {
    await run(["bun", "scripts/mobile.ts", "add", ...args], "add native project");
  },
  "mobile:sync": async (args) => {
    await run(["bun", "scripts/mobile.ts", "sync", ...args], "sync mobile assets");
  },
  "mobile:open": async (args) => {
    await run(["bun", "scripts/mobile.ts", "open", ...args], "open native project");
  },
  "cloudflare:dev": async () => {
    await run(["bun", "run", "--cwd", "apps/web", "dev:cloudflare"], "Cloudflare Workers dev");
  },
  "cloudflare:build": async () => {
    await buildCloudflare();
  },
  "cloudflare:deploy": async () => {
    await run(["bun", "erp.ts", "cloudflare:build"], "Cloudflare Worker build");
    await run(
      ["bun", "run", "--cwd", "apps/web", "wrangler", "deploy", "--config", "dist/bun_erp_template/wrangler.json"],
      "Cloudflare deploy",
    );
  },
  preview: async () => {
    await run(["bun", "run", "--cwd", "apps/web", "preview", "--host", "127.0.0.1"], "web preview");
  },
  check: async () => {
    // biome and tsc run first: a type error explains most of the gate noise below, so seeing
    // them first saves reading twelve reports to find the cause.
    const { runProjectChecks } = await import("./tools/parallel-gates.ts");
    process.stdout.write("Running project checks (up to 6 in parallel)…\n");
    const results = await runProjectChecks(repoRoot, {
      onResult: (r) => process.stdout.write(`  ${r.ok ? "ok  " : "FAIL"} ${r.name} (${r.ms}ms)\n`),
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      for (const r of failed) process.stdout.write(`\n${r.name} failed:\n${r.output}\n`);
      throw new GateFailure(failed.map((r) => r.name));
    }
    process.stdout.write("check: OK\n");
  },

  test: async () => {
    await run(["bun", "apps/server/test-runner.ts"], "bun test server");
    await run(["bun", "test", "apps/web"], "bun test web");
    await run(["bun", "test", "apps/mobile"], "bun test mobile");
    await run(["bun", "test", "packages/utils/tests"], "bun test shared utilities");
    await run(["bun", "test", "packages/data-table/tests"], "bun test shared data table");
    await run(["bun", "test", "packages/charts/tests"], "bun test shared charts");
    await run(["bun", "test", "packages/i18n/tests"], "bun test i18n");
    await run(["bun", "test", "packages/editor/tests"], "bun test rich-text editor");
    await run(["bun", "test", "packages/email/tests"], "bun test email components");
    await run(["bun", "test", "packages/pdf/tests"], "bun test PDF components");
  },

  doctor: async () => {
    const checks: [string, boolean, string][] = [];
    checks.push(["bun version pinned", Bun.version === "1.4.2", `running ${Bun.version}`]);
    const envFile = await Bun.file(resolve(repoRoot, ".env")).exists();
    checks.push([".env present", envFile, envFile ? "found" : "copy .env.example -> .env"]);
    try {
      const ctx = await createCliContext({ migrateOnStart: false });
      await ctx.db.execute(sql`select 1`);
      checks.push(["database reachable", true, loadEnv().DATABASE_DRIVER]);
      const orgs = await ctx.db.select({ id: organizations.id }).from(organizations).limit(1);
      checks.push(["organization seeded", orgs.length > 0, orgs.length > 0 ? "ok" : "run: bun erp db:seed"]);
      await ctx.close();
    } catch (err) {
      checks.push(["database reachable", false, err instanceof Error ? err.message : String(err)]);
    }
    for (const [label, pass, detail] of checks) {
      process.stdout.write(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(24)} ${detail}\n`);
    }
    if (checks.some(([, pass]) => !pass)) process.exit(1);
  },

  dev: async () => {
    await run(["bun", "scripts/dev.ts"], "local web and API development");
  },

  "server:api": async () => {
    await run(["bun", "apps/server/server.ts", "--api-only"], "API-only server");
  },

  /** Build the client assets served by the default Bun web-and-API server. */
  build: async () => {
    if (deploymentTarget() === "cloudflare") {
      await buildCloudflare();
      process.stdout.write("build: OK — Cloudflare Worker and static assets are in apps/web/dist\n");
      return;
    }
    await run(["bun", "run", "--cwd", "apps/web", "build"], "web build (vite)");
    process.stdout.write("build: OK — output in apps/web/dist\n");
  },

  /** Readiness gate: the checks that only matter when this stops being a laptop project. */
  "check:prod": async () => {
    await guard("readiness", async () => {
      const { checkReadiness } = await import("./tools/readiness.ts");
      const findings = (await checkReadiness(repoRoot)).map((f) => `${f.rule}: ${f.detail}`);
      if (findings.length > 0) throw new GateFailure(findings);
    });
    process.stdout.write("check:prod: OK\n");
  },
  "env:list": async () => {
    const env = loadEnv();
    process.stdout.write("Config keys (values of secrets are never printed):\n");
    for (const [key, value] of Object.entries(env.safeSummary)) {
      process.stdout.write(`  ${key.padEnd(28)} ${value}\n`);
    }
    const warnings = strayKeyWarnings();
    if (warnings.length > 0) {
      process.stdout.write("\nWarnings:\n");
      for (const w of warnings) process.stdout.write(`  ! ${w}\n`);
    }
  },

  "route:list": async () => {
    // Routes are read from the app as actually assembled — not a hardcoded list that can go stale.
    const ctx = await createCliContext({ migrateOnStart: false });
    const app = createApp(ctx, await resolveDefaultOrganizationId(ctx.db));
    const routes = app.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method.padEnd(6)} ${r.path}`)
      .sort()
      .filter((r, i, all) => all.indexOf(r) === i);
    process.stdout.write(`${routes.join("\n")}\n`);
    await ctx.close();
  },

  // Chicken-and-egg escape hatch: the first owner cannot be created over HTTP that requires a role.
  "user:create": async (args) => {
    const [email, password, ...options] = args;
    if (!email || !password) {
      process.stderr.write("Usage: bun erp user:create <email> <password> [--role <key>] [--name <name>]\n");
      process.stderr.write(
        "Run `bun erp role:list` to see available roles. The first user defaults to owner; later users default to staff.\n",
      );
      process.exit(1);
    }
    let roleKey: string | undefined;
    let name: string | undefined;
    const positional: string[] = [];
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "--role" || option === "--name") {
        const value = options[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
        if (option === "--role") roleKey = value;
        else name = value;
        index += 1;
        continue;
      }
      if (option?.startsWith("--")) throw new Error(`Unknown option: ${option}`);
      positional.push(option ?? "");
    }

    if (positional.length > 0) {
      if (roleKey) throw new Error("Use either --role or the legacy positional role, not both");
      roleKey = positional[0];
      if (positional.length > 1) name = positional.slice(1).join(" ");
    }

    const parsedInput = createUserSchema.safeParse({
      email,
      password,
      name: name ?? email.split("@")[0] ?? "User",
      ...(roleKey ? { roleKey } : {}),
    });
    if (!parsedInput.success) {
      const details = parsedInput.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("\n");
      process.stderr.write(`Invalid user details:\n${details}\n`);
      process.exit(1);
    }

    const env = loadEnv();
    const ctx = await createCliContext({ migrateOnStart: false, env });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const existingUser = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.organizationId, organizationId))
        .limit(1);
      roleKey ??= existingUser.length === 0 ? "owner" : "staff";

      const availableRoles = await ctx.db
        .select({ key: roleTable.key })
        .from(roleTable)
        .where(eq(roleTable.organizationId, organizationId))
        .orderBy(roleTable.key);
      const roleKeys = availableRoles.map(({ key }) => key);
      if (!roleKeys.includes(roleKey)) {
        throw new Error(
          `Unknown role "${roleKey}". Available: ${roleKeys.join(", ") || "none"}. Run bun erp role:list.`,
        );
      }

      const created = await createUser(
        ctx.db,
        organizationId,
        { ...parsedInput.data, roleKey },
        { userId: null, traceId: `cli-${Date.now()}`, label: "cli" },
      );
      const target = `configured database (${ctx.env.APP_ENV}/${ctx.env.DATABASE_DRIVER})`;
      process.stdout.write(`Created ${created.email} (${created.roles.map((r) => r.key).join(", ")}) in ${target}.\n`);
    } finally {
      await ctx.close();
    }
  },

  "role:list": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const availableRoles = await ctx.db
        .select({ key: roleTable.key, name: roleTable.name, isSystem: roleTable.isSystem })
        .from(roleTable)
        .where(eq(roleTable.organizationId, organizationId))
        .orderBy(roleTable.key);
      if (availableRoles.length === 0) {
        process.stdout.write("No roles found. Run `bun erp db:seed` first.\n");
        return;
      }
      for (const role of availableRoles) {
        process.stdout.write(`${role.key.padEnd(16)} ${role.name}${role.isSystem ? " (system)" : ""}\n`);
      }
      process.stdout.write("Use a role key with `bun erp user:create ... --role <key>`.\n");
    } finally {
      await ctx.close();
    }
  },

  "role:show": async (args) => {
    const [key] = args;
    if (!key) {
      process.stderr.write("Usage: bun erp role:show <key>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const role = await requireRoleByKey(ctx.db, organizationId, key);
      const permissions = await permissionsForRole(ctx.db, role.id);
      process.stdout.write(`key:         ${role.key}\n`);
      process.stdout.write(`name:        ${role.name}\n`);
      process.stdout.write(`description: ${role.description || "—"}\n`);
      process.stdout.write(`type:        ${role.isSystem ? "system" : "custom"}\n`);
      process.stdout.write(`permissions: ${permissions.length}\n`);
      for (const permission of permissions) process.stdout.write(`  ${permission}\n`);
    } finally {
      await ctx.close();
    }
  },

  "role:create": async (args) => {
    const parsed = parseCommandOptions(args, { values: ["name", "description", "permissions"] });
    const key = parsed.positional[0];
    if (!key) {
      process.stderr.write(
        "Usage: bun erp role:create <key> [--name <name>] [--description <text>] [--permissions a,b]\n",
      );
      process.exit(1);
    }
    const input = createRoleSchema.safeParse({
      key,
      name: parsed.values.get("name") ?? humanizeKey(key),
      ...(parsed.values.has("description") ? { description: parsed.values.get("description") } : {}),
    });
    if (!input.success) {
      process.stderr.write(`Invalid role details:\n${formatIssues(input.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const role = await createRole(ctx.db, organizationId, input.data, cliActor());
      let permissionCount = 0;
      if (parsed.values.has("permissions")) {
        const keys = parseKeyList(parsed.values.get("permissions") ?? "");
        await setRolePermissions(ctx.db, organizationId, role.id, keys, cliActor());
        permissionCount = keys.length;
      }
      process.stdout.write(`Created role "${role.key}" (${role.name}) with ${permissionCount} permission(s).\n`);
    } finally {
      await ctx.close();
    }
  },

  "role:edit": async (args) => {
    const parsed = parseCommandOptions(args, { values: ["name", "description", "permissions"] });
    const key = parsed.positional[0];
    if (!key) {
      process.stderr.write(
        "Usage: bun erp role:edit <key> [--name <name>] [--description <text>] [--permissions a,b]\n",
      );
      process.exit(1);
    }
    if (parsed.values.size === 0) {
      process.stderr.write("Provide at least one of --name, --description, or --permissions.\n");
      process.exit(1);
    }
    const patch =
      parsed.values.has("name") || parsed.values.has("description")
        ? updateRoleSchema.safeParse({
            ...(parsed.values.has("name") ? { name: parsed.values.get("name") } : {}),
            ...(parsed.values.has("description") ? { description: parsed.values.get("description") } : {}),
          })
        : undefined;
    if (patch && !patch.success) {
      process.stderr.write(`Invalid role details:\n${formatIssues(patch.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const role = await requireRoleByKey(ctx.db, organizationId, key);
      if (patch?.success) await updateRole(ctx.db, organizationId, role.id, patch.data, cliActor());
      if (parsed.values.has("permissions")) {
        const keys = parseKeyList(parsed.values.get("permissions") ?? "");
        await setRolePermissions(ctx.db, organizationId, role.id, keys, cliActor());
      }
      process.stdout.write(`Updated role "${role.key}".\n`);
    } finally {
      await ctx.close();
    }
  },

  "role:delete": async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"] });
    const key = parsed.positional[0];
    if (!key) {
      process.stderr.write("Usage: bun erp role:delete <key> --force\n");
      process.exit(1);
    }
    if (!parsed.flags.has("force")) {
      process.stderr.write(`Refusing to delete a role without --force. Run: bun erp role:delete ${key} --force\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const role = await requireRoleByKey(ctx.db, organizationId, key);
      await deleteRole(ctx.db, organizationId, role.id, cliActor());
      process.stdout.write(`Deleted role "${role.key}".\n`);
    } finally {
      await ctx.close();
    }
  },

  "user:grant": async (args) => {
    const [email, roleKey = "owner"] = args;
    if (!email) {
      process.stderr.write("Usage: bun erp user:grant <email> [roleKey]\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    const organizationId = await resolveDefaultOrganizationId(ctx.db);
    const userRows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) {
      process.stderr.write(`No user with email ${email}. Sign up first.\n`);
      await ctx.close();
      process.exit(1);
    }
    const role = await findRoleByKey(ctx.db, organizationId, roleKey);
    if (!role) {
      const available = await ctx.db
        .select({ key: roleTable.key })
        .from(roleTable)
        .where(eq(roleTable.organizationId, organizationId))
        .orderBy(roleTable.key);
      process.stderr.write(
        `No role "${roleKey}" in this organization. Available: ${available.map(({ key }) => key).join(", ") || "none"}. Run: bun erp role:list\n`,
      );
      await ctx.close();
      process.exit(1);
    }
    await assignRole(ctx.db, { userId: user.id, roleId: role.id });
    await recordAudit(ctx.db, {
      organizationId,
      actorId: null,
      actorLabel: "cli",
      event: "user.role_assigned",
      subjectType: "user",
      subjectId: user.id,
      after: snapshot("userRole", { userId: user.id, roleId: role.id, scopeType: null, scopeId: null }),
      traceId: `cli-${Date.now()}`,
    });
    process.stdout.write(`Granted "${roleKey}" to ${email}.\n`);
    await ctx.close();
  },

  // Password reset via CLI: the recovery path while no e-mail driver exists. Audit is still recorded.
  "user:passwd": async (args) => {
    const [email, newPassword] = args;
    if (!email) {
      process.stderr.write("Usage: bun erp user:passwd <email> [sandi-baru]\n");
      process.exit(1);
    }
    const password = newPassword ?? Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6)).join("-");
    const ctx = await createCliContext({ migrateOnStart: false });
    const organizationId = await resolveDefaultOrganizationId(ctx.db);
    const userRows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) {
      process.stderr.write(`No user with email ${email}.\n`);
      await ctx.close();
      process.exit(1);
    }

    const hash = await hashPassword(password);
    await ctx.db.transaction(async (tx) => {
      const updated = await tx
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accounts.userId, user.id))
        .returning({ id: accounts.id });
      if (updated.length === 0) {
        await tx
          .insert(accounts)
          .values({ accountId: user.id, providerId: "credential", userId: user.id, password: hash });
      }
      await recordAudit(tx as unknown as Database, {
        organizationId,
        actorId: null,
        actorLabel: "cli",
        event: "user.password_reset",
        subjectType: "user",
        subjectId: user.id,
        traceId: `cli-${Date.now()}`,
      });
    });
    process.stdout.write(`Password updated: ${email}\nNew password: ${password}\n`);
    await ctx.close();
  },

  "user:list": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const rows = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(users.email);
    for (const u of rows) {
      const roles = (await rolesForUser(ctx.db, u.id)).map((r) => r.key).join(", ");
      process.stdout.write(`${u.email.padEnd(40)} ${u.name.padEnd(20)} ${roles || "—"}\n`);
    }
    process.stdout.write(`total: ${rows.length}\n`);
    await ctx.close();
  },

  "user:show": async (args) => {
    const parsed = parseCommandOptions(args, {});
    const email = parsed.positional[0];
    if (!email) {
      process.stderr.write("Usage: bun erp user:show <email>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      const roles = await rolesForUser(ctx.db, user.id);
      const permissions = await permissionsForUser(ctx.db, user.id);
      process.stdout.write(`email:          ${user.email}\n`);
      process.stdout.write(`name:           ${user.name}\n`);
      process.stdout.write(`organizationId: ${user.organizationId ?? "—"}\n`);
      process.stdout.write(`emailVerified:  ${user.emailVerified ? "yes" : "no"}\n`);
      process.stdout.write(`roles:          ${roles.map((role) => role.key).join(", ") || "—"}\n`);
      process.stdout.write(`permissions:    ${permissions.length}\n`);
    } finally {
      await ctx.close();
    }
  },

  "user:edit": async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["verified", "unverified"], values: ["name", "roles"] });
    const email = parsed.positional[0];
    if (!email) {
      process.stderr.write(
        "Usage: bun erp user:edit <email> [--name <name>] [--verified|--unverified] [--roles a,b]\n",
      );
      process.exit(1);
    }
    if (parsed.values.size === 0 && parsed.flags.size === 0) {
      process.stderr.write("Provide at least one of --name, --verified, --unverified, or --roles.\n");
      process.exit(1);
    }
    if (parsed.flags.has("verified") && parsed.flags.has("unverified")) {
      throw new Error("Use either --verified or --unverified, not both");
    }
    const patch = updateUserSchema.safeParse({
      ...(parsed.values.has("name") ? { name: parsed.values.get("name") } : {}),
      ...(parsed.flags.has("verified") ? { emailVerified: true } : {}),
      ...(parsed.flags.has("unverified") ? { emailVerified: false } : {}),
    });
    if (!patch.success) {
      process.stderr.write(`Invalid user details:\n${formatIssues(patch.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      if (Object.keys(patch.data).length > 0) {
        await updateUser(ctx.db, organizationId, user.id, patch.data, cliActor());
      }
      if (parsed.values.has("roles")) {
        const roleKeys = parseKeyList(parsed.values.get("roles") ?? "");
        await replaceUserRoles(ctx.db, organizationId, user.id, roleKeys, cliActor());
      }
      process.stdout.write(`Updated user ${email}.\n`);
    } finally {
      await ctx.close();
    }
  },

  "user:delete": async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"] });
    const email = parsed.positional[0];
    if (!email) {
      process.stderr.write("Usage: bun erp user:delete <email> --force\n");
      process.exit(1);
    }
    if (!parsed.flags.has("force")) {
      process.stderr.write(`Refusing to delete a user without --force. Run: bun erp user:delete ${email} --force\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      await deleteUser(ctx.db, organizationId, user.id, cliActor());
      process.stdout.write(`Deleted user ${email}.\n`);
    } finally {
      await ctx.close();
    }
  },

  "user:revoke": async (args) => {
    const parsed = parseCommandOptions(args, {});
    const [email, roleKey] = parsed.positional;
    if (!email || !roleKey) {
      process.stderr.write("Usage: bun erp user:revoke <email> <roleKey>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      await revokeUserRole(ctx.db, organizationId, user.id, roleKey, cliActor());
      process.stdout.write(`Revoked "${roleKey}" from ${email}.\n`);
    } finally {
      await ctx.close();
    }
  },

  "db:migrate": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const ran = await migrate(ctx.db, MIGRATIONS_DIR);
    process.stdout.write(ran.length === 0 ? "No pending migrations.\n" : `Applied: ${ran.join(", ")}\n`);
    await ctx.close();
  },

  // Exit 1 when any migration is pending — CI uses it to force db:migrate before deploy.

  "db:status": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const files = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })]
      .filter((file) => /^\d{4}_[a-z0-9_]+\.ts$/.test(file))
      .sort();
    // Same unwrapping as the runner: PGlite returns `{ rows }`, postgres-js an array.
    const rows = rowsOf<{ name: string }>(await ctx.db.execute(sql`select name from _migrations`));
    const appliedIds = new Set(rows.map((row) => row.name.match(/^(\d{4})_/)?.[1] ?? row.name));
    const pending = files.filter((file) => !appliedIds.has(file.slice(0, 4)));
    for (const f of files) {
      process.stdout.write(`  ${appliedIds.has(f.slice(0, 4)) ? "applied " : "PENDING"} ${f}\n`);
    }
    process.stdout.write(`\n${files.length - pending.length}/${files.length} applied, ${pending.length} pending\n`);
    await ctx.close();
    if (pending.length > 0) process.exitCode = 1;
  },

  "db:seed": async (args) => {
    const requestedSeeder = args[0] ? toSeederName(args[0]) : undefined;
    if (args.length > 1) {
      process.stderr.write("Usage: bun erp db:seed [seeder]\n");
      process.exit(1);
    }
    const seederFiles = listSeederFiles();
    if (requestedSeeder && !seederFiles.includes(`${requestedSeeder}.ts`)) {
      process.stderr.write(
        `Seeder not found: ${requestedSeeder}. Available: ${seederFiles.map((file) => file.slice(0, -3)).join(", ") || "none"}.\n`,
      );
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const result = await seed(ctx.db);
      process.stdout.write(
        `Seeded ${result.organizations} organization(s), ${result.permissions} permission(s), ${result.roles} role(s).\n`,
      );
      const selected = requestedSeeder ? [`${requestedSeeder}.ts`] : seederFiles;
      for (const file of selected) {
        const module = (await import(resolve(SEEDERS_DIR, file))) as { seed?: (database: Database) => Promise<void> };
        if (typeof module.seed !== "function") throw new Error(`Seeder ${file} must export seed(database)`);
        await module.seed(ctx.db);
        process.stdout.write(`Ran feature seeder: ${file}\n`);
      }
    } finally {
      await ctx.close();
    }
  },

  "jobs:work": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const worker = startJobWorker({ db: ctx.db, registry: createJobRegistry(), logger: ctx.logger });
    const stop = () => worker.stop();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
      await worker.done;
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await ctx.close();
    }
  },

  "jobs:run-once": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const processed = await runJobBatch(ctx.db, createJobRegistry(), ctx.logger, { limit: 20 });
      process.stdout.write(`Processed ${processed} background job(s).\n`);
    } finally {
      await ctx.close();
    }
  },

  "jobs:status": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const rows = rowsOf<{ status: string; count: string | number }>(
        await ctx.db.execute(
          sql`select status, count(*) as count from background_jobs group by status order by status`,
        ),
      );
      for (const row of rows) process.stdout.write(`${row.status.padEnd(12)} ${row.count}\n`);
      if (rows.length === 0) process.stdout.write("No background jobs.\n");
    } finally {
      await ctx.close();
    }
  },

  "jobs:dead": async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const rows = rowsOf<{
        id: string;
        name: string;
        queue: string;
        attemptCount: number;
        lastErrorCode: string | null;
        updatedAt: Date;
      }>(
        await ctx.db.execute(sql`
        select id, job_name as name, queue_name as queue, attempt_count as "attemptCount",
          last_error_code as "lastErrorCode", updated_at as "updatedAt"
        from background_jobs where status = 'dead' order by updated_at desc limit 100
      `),
      );
      for (const row of rows) {
        process.stdout.write(
          `${row.id}  ${row.name}  ${row.queue}  attempts=${row.attemptCount}  ${row.lastErrorCode ?? "unknown"}\n`,
        );
      }
      if (rows.length === 0) process.stdout.write("No dead jobs.\n");
    } finally {
      await ctx.close();
    }
  },

  "jobs:retry": async (args) => {
    const [id] = args;
    if (!id) {
      process.stderr.write("Usage: bun erp jobs:retry <job-id>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      if (!(await requeueDeadJob(ctx.db, id))) throw new Error("No dead job found with that ID.");
      ctx.logger.warn({ event: "jobs.operator_requeued", jobId: id });
      process.stdout.write(`Requeued ${id}.\n`);
    } finally {
      await ctx.close();
    }
  },

  "key:generate": async () => {
    const file = Bun.file(resolve(repoRoot, ".env"));
    if (!(await file.exists())) {
      process.stderr.write("No .env file — copy .env.example first.\n");
      process.exit(1);
    }
    const body = await file.text();
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const next = /^BETTER_AUTH_SECRET=.*$/m.test(body)
      ? body.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`)
      : `${body.trimEnd()}\nBETTER_AUTH_SECRET=${secret}\n`;
    await Bun.write(resolve(repoRoot, ".env"), next);
    process.stdout.write("BETTER_AUTH_SECRET written to .env (32 bytes hex).\n");
  },

  "check:migrations": async () => {
    const files = [...new Bun.Glob("*").scanSync({ cwd: MIGRATIONS_DIR })].sort();
    const bad = files.filter((file) => !/^\d{4}_[a-z0-9_]+\.ts$/.test(file));
    if (bad.length > 0) {
      process.stderr.write(`Migration modules must be NNNN_snake_case.ts: ${bad.join(", ")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${files.length} TypeScript migration module(s) named correctly.\n`);
  },

  "check:scope": async () => {
    await guard("scope", () => runGate("scope"));
    process.stdout.write("Scope OK: no client name or business rule in template files.\n");
  },

  "check:react": async () => {
    await guard("react", () => runGate("react"));
    process.stdout.write("React Doctor OK.\n");
  },

  "check:task": async () => {
    await guard("task", () => runGate("task"));
    process.stdout.write("Tasks valid.\n");
  },

  // Gate yang sama dengan `check`, tapi bisa dijalankan sendiri saat mengerjakan satu bidang.
  // Docs dan skills menunjuk perintah ini, jadi ia harus benar-benar ada.
  "check:slop": async () => {
    await guard("slop", () => runGate("slop"));
    process.stdout.write("Slop OK.\n");
  },
  "check:platform": async () => {
    await guard("platform", () => runGate("platform"));
    process.stdout.write("Platform OK: Bun only, no stray Node built-ins.\n");
  },
  "check:copy": async () => {
    await guard("copy", () => runGate("copy"));
    process.stdout.write("Copy OK: no technical vocabulary on screen.\n");
  },
  "check:design": async () => {
    await guard("design", () => runGate("design"));
    process.stdout.write("Design OK: screens and text contrast meet the visual rules.\n");
  },
  "check:surface": async () => {
    await guard("surface", () => runGate("surface"));
    process.stdout.write("Surface OK: transient feedback and contextual errors follow the reviewed contract.\n");
  },
  "check:shadcn": async () => {
    await guard("shadcn", () => runGate("shadcn"));
    process.stdout.write("shadcn OK: components come from the design system.\n");
  },

  "check:ui": async () => {
    await guard("ui", () => runGate("ui"));
    process.stdout.write("UI completeness OK: states, focus, theme.\n");
  },

  "skills:validate": async () => {
    await guard("skills", () => runGate("skills"));
    process.stdout.write("Skills OK.\n");
  },
};

async function writeScaffold(path: string, source: string): Promise<void> {
  if (await Bun.file(path).exists()) throw new Error(`Refusing to overwrite existing file: ${path}`);
  await Bun.$`mkdir -p ${resolve(path, "..")}`.quiet();
  await Bun.write(path, source);
}

/** Generated code must survive `bun run lint`; let the repo's own formatter settle name-dependent wrapping. */
async function formatScaffold(paths: readonly string[]): Promise<void> {
  const biome = resolve(repoRoot, "node_modules/.bin/biome");
  if (!(await Bun.file(biome).exists())) return;
  const proc = Bun.spawn([biome, "format", "--write", ...paths], {
    cwd: repoRoot,
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}

function listSeederFiles(): string[] {
  try {
    return [...new Bun.Glob("*.ts").scanSync({ cwd: SEEDERS_DIR })].sort();
  } catch {
    return [];
  }
}

const [command, ...args] = process.argv.slice(2);

async function createCliContext(options: Parameters<typeof createContext>[0] = {}) {
  return createContext({ ...options, env: options.env ?? loadEnv() });
}

if (!command || command === "--help" || command === "-h" || command === "help") {
  const sections = HELP_GROUPS.map(({ title, commands: entries }) => {
    const width = Math.max(...entries.map(([name]) => name.length));
    const lines = entries.map(([name, description]) => `  ${name.padEnd(width)}  ${description}`).join("\n");
    return `${title}\n${lines}`;
  });
  process.stdout.write(`bun erp <command> [args]\n\n${sections.join("\n\n")}\n`);
  process.exit(0);
}

const handler = commands[command];
if (!handler) {
  process.stderr.write(`Unknown command: ${command}. Run: bun erp --help\n`);
  process.exit(1);
}

try {
  await handler(args);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
