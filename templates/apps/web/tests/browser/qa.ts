/**
 * End-to-end QA against a running deployment.
 *
 * Usage:
 *   bun erp qa                        # core suite + every installed feature suite
 *   bun erp qa --list              # show suites and why one is skipped
 *   bun erp qa --dry-run           # print the plan (suites + checks) without a browser
 *   bun erp qa --only=core,users   # run selected suites only
 *   QA_BASE_URL=https://erp.example bun erp qa
 *   CHROME_PATH=/usr/bin/chromium bun erp qa
 *
 * The core suite only touches what a default install ships (login, Beranda, notifications,
 * sign-out, unauthenticated redirect); `users`, `roles` and `audit` run only when their catalog
 * feature is installed. Every check is isolated, and any API response >= 400 or uncaught JS error
 * fails the run. This exists because unit tests cannot see a 422 that only happens when the UI
 * sends a query shape the API rejects. Exits non-zero on any failure, so CI can gate on it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { isExpectedConsoleError, isExpectedResponse } from "./expected.ts";
import { type QaCheck, type QaContext, type QaSuite, SUITES } from "./suites.ts";

const WEB = process.env.QA_BASE_URL ?? "http://localhost:4173";
const CHROME = process.env.CHROME_PATH ?? chromium.executablePath();
const EMAIL = process.env.QA_EMAIL ?? "admin@erp.local";
const PASSWORD = process.env.QA_PASSWORD ?? "";
/** apps/web, resolved from the test location, so feature detection works from any cwd. */
const WEB_DIR = resolve(import.meta.dir, "../..");

type ResultStatus = "pass" | "fail" | "skip";
type CheckResult = { suite: string; name: string; status: ResultStatus; note: string };
type SuiteRun = { name: string; status: "ran" | "skipped"; reason: string };

const args = Bun.argv.slice(2);

function readOnly(): string[] | undefined {
  const index = args.findIndex((arg) => arg === "--only" || arg.startsWith("--only="));
  if (index === -1) return undefined;
  const flag = args[index] ?? "";
  const value = flag === "--only" ? (args[index + 1] ?? "") : flag.slice("--only=".length);
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

const only = readOnly();
const knownSuites = SUITES.map((suite) => suite.name);
const unknownSuites = only?.filter((name) => !knownSuites.includes(name)) ?? [];

function selectSuites(): { run: QaSuite[]; skipped: SuiteRun[] } {
  const run: QaSuite[] = [];
  const skipped: SuiteRun[] = [];
  for (const suite of SUITES) {
    if (only && !only.includes(suite.name)) {
      skipped.push({ name: suite.name, status: "skipped", reason: "not selected" });
      continue;
    }
    if (suite.feature && !existsSync(resolve(WEB_DIR, "src/features", suite.feature))) {
      skipped.push({ name: suite.name, status: "skipped", reason: `feature "${suite.feature}" is not installed` });
      continue;
    }
    run.push(suite);
  }
  return { run, skipped };
}

function printList(): void {
  const { run, skipped } = selectSuites();
  const reasons = new Map(skipped.map((suite) => [suite.name, suite.reason]));
  for (const suite of SUITES) {
    const selected = run.some((candidate) => candidate.name === suite.name);
    console.log(`${suite.name.padEnd(6)} ${selected ? "run" : `skip — ${reasons.get(suite.name) ?? "skipped"}`}`);
  }
}

function printPlan(): void {
  const { run, skipped } = selectSuites();
  const reasons = new Map(skipped.map((suite) => [suite.name, suite.reason]));
  for (const suite of SUITES) {
    const selected = run.some((candidate) => candidate.name === suite.name);
    if (!selected) {
      console.log(`${suite.name} (skip — ${reasons.get(suite.name) ?? "skipped"})`);
      continue;
    }
    console.log(`${suite.name} (${suite.checks.length} checks)`);
    for (const check of suite.checks) console.log(`  - ${check.name}`);
  }
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: bun erp qa [--list] [--dry-run] [--only=core,login,users,roles,audit]",
      "",
      "  --list      show suites and whether they will run",
      "  --dry-run   print the plan without launching a browser",
      "  --only      comma-separated suite names to run",
      "",
      "Env: QA_BASE_URL, QA_EMAIL, QA_PASSWORD, CHROME_PATH",
    ].join("\n"),
  );
  process.exit(0);
}

if (unknownSuites.length > 0) {
  console.error(`Unknown suite(s): ${unknownSuites.join(", ")}. Known suites: ${knownSuites.join(", ")}.`);
  process.exit(1);
}

if (args.includes("--list")) {
  printList();
  process.exit(0);
}

if (args.includes("--dry-run")) {
  printPlan();
  process.exit(0);
}

if (!PASSWORD) {
  console.error("QA_PASSWORD is required (the owner account's password)");
  process.exit(2);
}

const { run, skipped } = selectSuites();
if (run.length === 0) {
  console.log("Nothing to run. Installed features do not include any selected suite.");
  process.exit(0);
}

const results: CheckResult[] = [];
const suiteRuns: SuiteRun[] = [...skipped];
const badResponses: string[] = [];
const errors: string[] = [];

function record(suite: string, name: string, status: ResultStatus, note: string): void {
  results.push({ suite, name, status, note });
  const label = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`${label}  [${suite}] ${name}${note ? ` — ${note}` : ""}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runCheck(suite: string, check: QaCheck, ctx: QaContext): Promise<void> {
  let status: ResultStatus = "pass";
  let note = "";
  try {
    const outcome = await check.run(ctx);
    if (outcome === false) {
      status = "fail";
      note = "check returned false";
    } else if (typeof outcome === "string") {
      status = "fail";
      note = outcome;
    }
  } catch (error) {
    status = "fail";
    note = errorMessage(error);
  }
  record(suite, check.name, status, note);
  if (status === "fail") {
    await ctx.page.screenshot({ path: `.data/qa/failure-${suite}.png`, fullPage: true }).catch(() => undefined);
  }
}

await Bun.$`mkdir -p .data/qa`.quiet();
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

for (const suite of run) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const suiteBadResponses: string[] = [];
  const suiteErrors: string[] = [];
  page.on("pageerror", (error) => suiteErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error" || message.text().includes("favicon")) return;
    if (isExpectedConsoleError({ text: message.text(), locationUrl: message.location().url })) return;
    suiteErrors.push(message.text());
  });
  /** Tracking every non-2xx is how a rejected query shape gets caught instead of shrugged at. */
  page.on("response", (response) => {
    const failure = { method: response.request().method(), url: response.url(), status: response.status() };
    if (failure.url.includes("/api/") && failure.status >= 400 && !isExpectedResponse(failure)) {
      suiteBadResponses.push(`${response.status()} ${response.url().slice(0, 110)}`);
    }
  });

  const ctx: QaContext = {
    page,
    browser,
    baseUrl: WEB,
    email: EMAIL,
    password: PASSWORD,
    badResponses: suiteBadResponses,
    errors: suiteErrors,
  };
  suiteRuns.push({ name: suite.name, status: "ran", reason: "" });

  if (suite.before) {
    try {
      await suite.before(ctx);
    } catch (error) {
      record(suite.name, `${suite.name}: open the screen`, "fail", errorMessage(error));
      ctx.stopReason ??= "suite setup failed";
    }
  }

  for (const check of suite.checks) {
    if (ctx.stopReason) {
      record(suite.name, check.name, "skip", ctx.stopReason);
      continue;
    }
    await runCheck(suite.name, check, ctx);
  }

  record(
    suite.name,
    `${suite.name}: no API responses >= 400`,
    suiteBadResponses.length > 0 ? "fail" : "pass",
    suiteBadResponses.slice(0, 3).join(" | "),
  );
  record(
    suite.name,
    `${suite.name}: no uncaught JS errors`,
    suiteErrors.length > 0 ? "fail" : "pass",
    suiteErrors.slice(0, 3).join(" | "),
  );
  badResponses.push(...suiteBadResponses);
  errors.push(...suiteErrors);
  await page.close();
}

await browser.close();

const failed = results.filter((result) => result.status === "fail");
const skippedChecks = results.filter((result) => result.status === "skip");
console.log("\n--- summary ---");
console.log(`failed: ${failed.length}, skipped: ${skippedChecks.length}, checks: ${results.length}`);
console.log(`API responses >= 400: ${badResponses.length}`);
for (const response of badResponses.slice(0, 8)) console.log("  ", response);
console.log(`JS errors: ${errors.length}`);
for (const error of errors.slice(0, 5)) console.log("  ", error);

async function currentCommit(): Promise<string> {
  try {
    return (await Bun.$`git rev-parse HEAD`.text()).trim();
  } catch {
    return "unknown";
  }
}

await Bun.write(
  ".data/qa/qa-report.json",
  JSON.stringify(
    {
      commit: await currentCommit(),
      time: new Date().toISOString(),
      bun: Bun.version,
      browser: browser.version(),
      suites: suiteRuns,
      results,
      badResponses,
      errors,
    },
    null,
    2,
  ),
);

process.exit(failed.length > 0 ? 1 : 0);
