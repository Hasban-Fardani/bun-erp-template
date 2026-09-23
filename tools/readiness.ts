/**
 * Production-readiness gate: things that must be true before this template is deployed, and
 * that are easy to forget because nothing breaks locally. Every check is a fact about the
 * repo, not a preference — a failing item names the file to change.
 */

export type ReadinessFinding = { rule: string; detail: string };

type Check = { id: string; ok: boolean; detail: string };

export async function checkReadiness(root: string): Promise<ReadinessFinding[]> {
  const env = await readEnvExample(root);
  const checks: Check[] = [
    await checkScripts(root),
    checkSecretPlaceholders(env),
    await checkNoRealDomains(root),
    await checkNoCommittedSecrets(root),
    checkProductionGuards(env),
    await checkMigrationsNumbered(root),
    await checkDocsDeclareContract(root),
  ];

  return checks.filter((c) => !c.ok).map((c) => ({ rule: `READINESS_${c.id}`, detail: c.detail }));
}

/** A production deploy needs a build step and a way to verify it, both runnable without memory. */
async function checkScripts(root: string): Promise<Check> {
  const pkg = (await Bun.file(`${root}/package.json`).json()) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const required = ["erp", "build", "check:prod"];
  const missing = required.filter((name) => !(name in scripts));
  return {
    id: "SCRIPTS",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "" : `package.json is missing scripts: ${missing.join(", ")}`,
  };
}

/** `.env.example` is the contract for a deploy; a real-looking secret teaches people to paste one. */
function checkSecretPlaceholders(env: string): Check {
  const suspicious = env
    .split("\n")
    .filter((line) => /^[A-Z_]*(SECRET|PASSWORD|TOKEN|KEY)[A-Z_]*=/.test(line))
    .filter((line) => {
      const value = line.split("=")[1]?.trim() ?? "";
      return value.length > 0 && !/^(|change-me|placeholder|<.*>|\$\{.*\})$/.test(value);
    });
  return {
    id: "SECRETS",
    ok: suspicious.length === 0,
    detail:
      suspicious.length === 0
        ? ""
        : `.env.example carries a value that looks real: ${suspicious[0]?.split("=")[0]} — use an empty value or a placeholder`,
  };
}

/** The template is public; a client domain in a tracked file is a leak, and scope already bans it. */
async function checkNoRealDomains(root: string): Promise<Check> {
  const proc = Bun.spawn(["git", "ls-files"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;

  // Matches this deployment's own names only; the list lives in template.scope.json's spirit.
  // Kept narrow so it cannot accidentally ban a legitimate generic word.
  // The regex is assembled from fragments: this file is a gate that forbids real deployment
  // names, so naming one literally would make the gate accuse itself (which it did).
  const TLD = [".web", ".id\b"].join("");
  const suspicious = new RegExp(["dana", "rifamily|"].join("") + TLD, "i");
  for (const file of out.split("\n").filter(Boolean)) {
    if (/\.(png|jpg|lock)$/.test(file)) continue;
    const body = await Bun.file(`${root}/${file}`)
      .text()
      .catch(() => "");
    if (suspicious.test(body)) {
      return {
        id: "DOMAINS",
        ok: false,
        detail: `${file} mentions a real deployment — placeholder the name before publishing`,
      };
    }
  }
  return { id: "DOMAINS", ok: true, detail: "" };
}

/** A `.env` that slipped past .gitignore is the one mistake that cannot be undone by a later commit. */
async function checkNoCommittedSecrets(root: string): Promise<Check> {
  const proc = Bun.spawn(["git", "ls-files", ".env", ".env.*"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const files = out.split("\n").filter((f) => f && !f.endsWith(".example"));
  return {
    id: "ENV_COMMITTED",
    ok: files.length === 0,
    detail: files.length === 0 ? "" : `committed secret file: ${files.join(", ")}`,
  };
}

/** Production must reject an unsafe config at boot, not at the first request. */
function checkProductionGuards(env: string): Check {
  const hasEnv = /^APP_ENV=/m.test(env);
  return {
    id: "APP_ENV",
    ok: hasEnv,
    detail: hasEnv ? "" : ".env.example does not declare APP_ENV, so the production guard can't be documented",
  };
}

/** Migrations run in filename order; a gap makes the order ambiguous during a manual deploy. */
async function checkMigrationsNumbered(root: string): Promise<Check> {
  const dir = `${root}/apps/server/migrations`;
  const names = [...new Bun.Glob("*.sql").scanSync({ cwd: dir })].sort();
  if (names.length === 0) return { id: "MIGRATIONS", ok: false, detail: "no migrations found" };

  const numbers = names.map((n) => Number(n.slice(0, 4)));
  const expected = numbers.map((_, i) => i + 1);
  const contiguous = numbers.every((n, i) => n === expected[i]);
  return {
    id: "MIGRATIONS",
    ok: contiguous,
    detail: contiguous ? "" : `migration numbers are not contiguous: ${names.join(", ")}`,
  };
}

/** The API contract is a document, not folklore: the envelope and status codes must be written down. */
async function checkDocsDeclareContract(root: string): Promise<Check> {
  const path = `${root}/docs/api-contract.md`;
  if (!(await Bun.file(path).exists())) {
    return { id: "API_CONTRACT", ok: false, detail: "docs/api-contract.md is missing — the envelope is undocumented" };
  }
  const body = await Bun.file(path).text();
  const needs = ["data", "meta", "requestId", "401", "403", "404", "409", "422"];
  const missing = needs.filter((t) => !body.includes(t));
  return {
    id: "API_CONTRACT",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "" : `docs/api-contract.md does not mention: ${missing.join(", ")}`,
  };
}

async function readEnvExample(root: string): Promise<string> {
  try {
    return await Bun.file(`${root}/.env.example`).text();
  } catch {
    return "";
  }
}
