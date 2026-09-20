#!/usr/bin/env bun
/**
 * CLI thin wrapper (PRD §11). Perintah memanggil modul yang sama dengan runtime —
 * CLI tidak menyimpan logika sendiri.
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { checkScope } from "../../tools/scope.ts";
import { validateSkills } from "../../tools/skills.ts";
import { loadTasks, validateTasks } from "../../tools/tasks.ts";
import { createContext, resolveDefaultOrganizationId } from "./context.ts";
import { createApp } from "./http/app.ts";
import { loadEnv, strayKeyWarnings } from "./platform/config/index.ts";
import { migrate } from "./platform/database/migrate.ts";
import { organizations } from "./platform/database/schema.ts";
import { seed } from "./platform/database/seed.ts";

const repoRoot = resolve(import.meta.dir, "../..");
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
async function runGate(kind: "skills" | "task" | "scope"): Promise<void> {
  let findings: string[];
  if (kind === "skills") {
    findings = (await validateSkills(SKILLS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else if (kind === "task") {
    findings = validateTasks(await loadTasks(TASKS_DIR)).map((f) => `${f.file}: ${f.message}`);
  } else {
    findings = (await checkScope(repoRoot)).map((f) => `${f.rule}: ${f.path} — ${f.detail}`);
  }
  if (findings.length > 0) throw new GateFailure(findings);
}

const commands: Record<string, () => Promise<void>> = {
  check: async () => {
    await run(["bunx", "--bun", "biome", "check", "."], "biome check");
    await run(["bunx", "--bun", "tsc", "-p", "tsconfig.json"], "tsc");
    await guard("skills", () => runGate("skills"));
    await guard("task", () => runGate("task"));
    await guard("scope", () => runGate("scope"));
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

  "db:migrate": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const ran = await migrate(ctx.db, MIGRATIONS_DIR);
    process.stdout.write(ran.length === 0 ? "No pending migrations.\n" : `Applied: ${ran.join(", ")}\n`);
    await ctx.close();
  },

  "db:seed": async () => {
    const ctx = await createContext({ migrateOnStart: false });
    const result = await seed(ctx.db);
    process.stdout.write(`Seeded ${result.organizations} organization(s).\n`);
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

  "check:task": async () => {
    await guard("task", () => runGate("task"));
    process.stdout.write("Tasks valid.\n");
  },

  "skills:validate": async () => {
    await guard("skills", () => runGate("skills"));
    process.stdout.write("Skills OK.\n");
  },
};

const [command] = process.argv.slice(2);

if (!command) {
  const list = Object.keys(commands)
    .map((c) => `  ${c}`)
    .join("\n");
  process.stdout.write(`bun erp <command>\n\nCommands:\n${list}\n`);
  process.exit(0);
}

const handler = commands[command];
if (!handler) {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exit(1);
}

try {
  await handler();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
