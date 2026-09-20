/**
 * CLI thin wrapper (PRD §11). Perintah memanggil modul yang sama dengan runtime —
 * CLI tidak menyimpan logika sendiri.
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { createContext, resolveDefaultOrganizationId } from "./apps/server/context.ts";
import { createApp } from "./apps/server/http/app.ts";
import { recordAudit, snapshot } from "./apps/server/modules/audit/service.ts";
import { accounts, users } from "./apps/server/modules/identity/data.ts";
import { createUser, hashPassword } from "./apps/server/modules/identity/service.ts";
import { assignRole, findRoleByKey, rolesForUser } from "./apps/server/modules/rbac/service.ts";
import { loadEnv, strayKeyWarnings } from "./apps/server/platform/config/index.ts";
import type { Database } from "./apps/server/platform/database/index.ts";
import { migrate } from "./apps/server/platform/database/migrate.ts";
import { organizations } from "./apps/server/platform/database/schema.ts";
import { seed } from "./apps/server/platform/database/seed.ts";
import { checkScope } from "./tools/scope.ts";
import { validateSkills } from "./tools/skills.ts";
import { loadTasks, validateTasks } from "./tools/tasks.ts";

const repoRoot = resolve(import.meta.dir);
const MIGRATIONS_DIR = resolve(repoRoot, "apps/server/migrations");
const TASKS_DIR = resolve(repoRoot, "docs/tasks");
const SKILLS_DIR = resolve(repoRoot, "skills");

/** Subproses yang gagal harus menghentikan gate — bukan sekadar dicatat lalu dilewati. */
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

/** Gate membaca file repo langsung — dipakai `check` dan bisa dipanggil sendiri. */
async function runGate(kind: "skills" | "task" | "scope" | "slop"): Promise<void> {
  let findings: string[];
  if (kind === "skills") {
    findings = (await validateSkills(SKILLS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "task") {
    findings = validateTasks(await loadTasks(TASKS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "scope") {
    findings = (await checkScope(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  } else if (kind === "slop") {
    const { findCodeSlop } = await import("./tools/slop.ts");
    findings = await findCodeSlop(repoRoot);
  } else {
    const { findReactDoctorIssues } = await import("./tools/react-doctor.ts");
    findings = await findReactDoctorIssues(repoRoot);
  }
  if (findings.length > 0) throw new GateFailure(findings);
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
  check: async () => {
    await run(["bunx", "--bun", "biome", "check", "."], "biome check");
    await run(["bunx", "--bun", "tsc", "-p", "tsconfig.json"], "tsc");
    await guard("skills", () => runGate("skills"));
    await guard("task", () => runGate("task"));
    await guard("scope", () => runGate("scope"));
    await guard("slop", () => runGate("slop"));
    await guard("react", () => runGate("react"));
    process.stdout.write("check: OK\n");
  },

  test: async () => {
    await run(["bun", "test", "apps/server"], "bun test");
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
    await run(["bun", "--watch", "apps/server/server.ts"], "server (watch)");
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
    // Route dibaca dari app yang benar-benar dibentuk — bukan daftar hardcode yang bisa basi.
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

  // Jalur keluar ayam-telur: owner pertama tak bisa dibuat via HTTP yang butuh role.
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

  // Sandi reset via CLI: jalur pemulihan saat e-mail driver belum ada. Audit tetap dicatat.
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

  // Exit 1 bila ada pending — dipakai CI untuk memaksa db:migrate sebelum deploy.

  "db:status": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set(
      await ctx.db
        .execute(sql`select name from _migrations`)
        .then((r) => (Array.isArray(r) ? r : (r as { rows: { name: string }[] }).rows).map((row) => row.name)),
    );
    const pending = files.filter((f) => !applied.has(f));
    for (const f of files) {
      process.stdout.write(`  ${applied.has(f) ? "applied " : "PENDING"} ${f}\n`);
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
    const files = await readdir(MIGRATIONS_DIR);
    const sql = files.filter((f) => f.endsWith(".sql")).sort();
    const bad = sql.filter((f) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(f));
    if (bad.length > 0) {
      process.stderr.write(`Migration names must be NNNN_snake_case.sql: ${bad.join(", ")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${sql.length} migration(s) named correctly.\n`);
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

  "skills:validate": async () => {
    await guard("skills", () => runGate("skills"));
    process.stdout.write("Skills OK.\n");
  },
};

const [command, ...args] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h" || command === "help") {
  const list = Object.keys(commands)
    .map((c) => `  ${c}`)
    .join("\n");
  process.stdout.write(`bun erp <command> [args]\n\nCommands:\n${list}\n`);
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
