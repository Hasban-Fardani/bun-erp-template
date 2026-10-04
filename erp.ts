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
import { createUser, hashPassword } from "./apps/server/features/identity/service.ts";
import { createJobRegistry } from "./apps/server/features/jobs.ts";
import { assignRole, findRoleByKey, rolesForUser } from "./apps/server/features/rbac/service.ts";
import { createApp } from "./apps/server/http/app.ts";
import { loadEnv, strayKeyWarnings } from "./apps/server/platform/config/index.ts";
import type { Database } from "./apps/server/platform/database/index.ts";
import { migrate, rowsOf } from "./apps/server/platform/database/migrate.ts";
import { organizations } from "./apps/server/platform/database/schema.ts";
import { seed } from "./apps/server/platform/database/seed.ts";
import { requeueDeadJob, runJobBatch } from "./apps/server/platform/jobs/queue.ts";
import { checkScope } from "./tools/scope.ts";
import { validateSkills } from "./tools/skills.ts";
import { loadTasks, validateTasks } from "./tools/tasks.ts";

const repoRoot = resolve(import.meta.dir);
const MIGRATIONS_DIR = resolve(repoRoot, "apps/server/migrations");
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
      ["build", "Build the web app for the Bun server"],
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
    title: "Database",
    commands: [
      ["db:migrate", "Apply pending TypeScript migrations"],
      ["db:status", "Show applied and pending migrations"],
      ["db:seed", "Seed infrastructure data"],
    ],
  },
  {
    title: "Application",
    commands: [
      ["route:list", "List routes from the assembled Hono app"],
      ["env:list", "Show safe configuration values and warnings"],
      ["key:generate", "Generate the local authentication secret"],
      ["user:create", "Create a user from the command line"],
      ["user:grant", "Grant a role to a user"],
      ["user:passwd", "Reset a user's password"],
      ["user:list", "List users and their roles"],
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
      ["mobile:package", "Build a native mobile package"],
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
    findings = (await checkDesign(repoRoot)).map((f) => `${f.screen} ${f.code}/${f.severity} — ${f.detail}`);
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
    const generatedLocalBindings = resolve(repoRoot, "apps/web/dist/bun_erp_template/.dev.vars");
    try {
      await run(["bun", "run", "--cwd", "apps/web", "build:cloudflare"], "Cloudflare Worker build");
    } finally {
      // The Vite plugin can materialize values from a local .env for development; they never belong in deploy output.
      await Bun.$`rm -f ${generatedLocalBindings}`.quiet();
    }
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
      const ctx = await createContext({ migrateOnStart: false });
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
    const ctx = await createContext({ migrateOnStart: false });
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
    const [email, password, roleKey = "staff", name] = args;
    if (!email || !password) {
      process.stderr.write("Usage: bun erp user:create <email> <password> [roleKey] [name]\n");
      process.exit(1);
    }
    const ctx = await createContext({ migrateOnStart: false });
    const organizationId = await resolveDefaultOrganizationId(ctx.db);
    const created = await createUser(
      ctx.db,
      organizationId,
      { email, password, roleKey, name: name ?? email.split("@")[0] ?? "User" },
      { userId: null, traceId: `cli-${Date.now()}`, label: "cli" },
    );
    process.stdout.write(`Created ${created.email} (${created.roles.map((r) => r.key).join(", ") || "tanpa role"})\n`);
    await ctx.close();
  },

  "user:grant": async (args) => {
    const [email, roleKey = "owner"] = args;
    if (!email) {
      process.stderr.write("Usage: bun erp user:grant <email> [roleKey]\n");
      process.exit(1);
    }
    const ctx = await createContext({ migrateOnStart: false });
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
      process.stderr.write(`No role "${roleKey}" in this organization. Run: bun erp db:seed\n`);
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
    const ctx = await createContext({ migrateOnStart: false });
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
    const ctx = await createContext({ migrateOnStart: false });
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

  "db:migrate": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const ran = await migrate(ctx.db, MIGRATIONS_DIR);
    process.stdout.write(ran.length === 0 ? "No pending migrations.\n" : `Applied: ${ran.join(", ")}\n`);
    await ctx.close();
  },

  // Exit 1 when any migration is pending — CI uses it to force db:migrate before deploy.

  "db:status": async () => {
    const ctx = await createContext({ migrateOnStart: false });
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

  "db:seed": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const result = await seed(ctx.db);
    process.stdout.write(
      `Seeded ${result.organizations} organization(s), ${result.permissions} permission(s), ${result.roles} role(s).\n`,
    );
    await ctx.close();
  },

  "jobs:work": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const registry = createJobRegistry();
    let stopping = false;
    const stop = () => {
      stopping = true;
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    ctx.logger.info({ event: "jobs.worker.started", pollIntervalMs: 1_000 });
    try {
      while (!stopping) {
        try {
          const processed = await runJobBatch(ctx.db, registry, ctx.logger, { limit: 10 });
          if (processed === 0) await Bun.sleep(1_000);
        } catch {
          ctx.logger.error({ event: "jobs.worker.poll_failed" });
          await Bun.sleep(2_000);
        }
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await ctx.close();
      ctx.logger.info({ event: "jobs.worker.stopped" });
    }
  },

  "jobs:run-once": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    try {
      const processed = await runJobBatch(ctx.db, createJobRegistry(), ctx.logger, { limit: 20 });
      process.stdout.write(`Processed ${processed} background job(s).\n`);
    } finally {
      await ctx.close();
    }
  },

  "jobs:status": async () => {
    const ctx = await createContext({ migrateOnStart: false });
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
    const ctx = await createContext({ migrateOnStart: false });
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
    const ctx = await createContext({ migrateOnStart: false });
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
    process.stdout.write("Design OK: every screen declares its direction.\n");
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

const [command, ...args] = process.argv.slice(2);

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
