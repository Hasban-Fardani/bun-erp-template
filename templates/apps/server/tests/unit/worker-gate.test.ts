import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runWorkerGate,
  scanWorkerGraph,
  WORKER_PLATFORM_LIMIT_BYTES,
  WORKER_RAW_BUDGET_BYTES,
  workerSizeFindings,
} from "@cli/gates/worker-gate.ts";

const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "worker-gate-"));
  roots.push(root);
  await mkdir(join(root, "apps/server/bootstrap"), { recursive: true });
  await mkdir(join(root, "apps/server/database"), { recursive: true });
  return root;
}

/** Entry + worker pair; cases vary only the worker body and its imports. */
async function fixtureGraph(root: string, workerBody: string): Promise<void> {
  await Bun.write(join(root, "apps/server/bootstrap/cloudflare-entry.ts"), 'export { default } from "./worker.ts";\n');
  await Bun.write(join(root, "apps/server/bootstrap/worker.ts"), workerBody);
}

async function graphFindings(root: string): Promise<string> {
  const { findings } = await scanWorkerGraph(root, "apps/server/bootstrap/cloudflare-entry.ts");
  return findings.join("\n");
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

type GateCase = {
  name: string;
  workerBody: string;
  extra?: { path: string; source: string };
  rule: string;
  expects?: string[];
};

const CASES: GateCase[] = [
  {
    name: "an unguarded Bun global in the Worker graph is a finding",
    workerBody: 'import { read } from "../config/index.ts";\nexport default { read };\n',
    extra: { path: "apps/server/config/index.ts", source: "export function read() {\n  return Bun.env.APP_NAME;\n}\n" },
    rule: "WORKER_BUN_GLOBAL",
    expects: ["apps/server/config/index.ts"],
  },
  {
    name: "import.meta.dir is always a finding",
    workerBody: "export const dir = import.meta.dir;\n",
    rule: "WORKER_IMPORT_META",
  },
  {
    name: "a new node: built-in in the Worker graph is a finding",
    workerBody: 'import { tmpdir } from "node:os";\nexport { tmpdir };\n',
    rule: "WORKER_NODE_BUILTIN",
    expects: ["node:os"],
  },
  {
    name: "importing the Scalar API reference into the Worker graph is a finding",
    workerBody: 'import { Scalar } from "@scalar/hono-api-reference";\nexport default { Scalar };\n',
    rule: "WORKER_FORBIDDEN_PACKAGE",
    expects: ["@scalar/hono-api-reference"],
  },
  {
    name: "a reachable migrate or seed module is a finding",
    workerBody: 'import { migrate } from "../database/migrate.ts";\nexport default { migrate };\n',
    extra: { path: "apps/server/database/migrate.ts", source: "export async function migrate() {}\n" },
    rule: "WORKER_DDL_PATH",
    expects: ["apps/server/database/migrate.ts"],
  },
];

for (const gateCase of CASES) {
  test(gateCase.name, async () => {
    const root = await fixtureRoot();
    await fixtureGraph(root, gateCase.workerBody);
    if (gateCase.extra) await Bun.write(join(root, gateCase.extra.path), gateCase.extra.source);
    const findings = await graphFindings(root);
    expect(findings).toContain(gateCase.rule);
    for (const expected of gateCase.expects ?? []) expect(findings).toContain(expected);
  });
}

test("a runtime-adaptive module with a typeof Bun guard is accepted", async () => {
  const root = await fixtureRoot();
  await fixtureGraph(root, 'import { put } from "../infra/storage.ts";\nexport default { put };\n');
  await Bun.write(
    join(root, "apps/server/infra/storage.ts"),
    'export async function put() {\n  if (typeof Bun === "undefined") throw new Error("needs Bun");\n  return Bun.file("/tmp/x").exists();\n}\n',
  );

  const result = await runWorkerGate(root, { staticOnly: true });
  expect(result.findings).toEqual([]);
});

test("static mode reports the entry and skips the bundle", async () => {
  const root = await fixtureRoot();
  await fixtureGraph(root, "export default { fetch() { return new Response('ok'); } };\n");

  const result = await runWorkerGate(root, { staticOnly: true });
  expect(result.findings).toEqual([]);
  expect(result.report.join("\n")).toContain("apps/server/bootstrap/cloudflare-entry.ts");
  expect(result.report.join("\n")).toContain("skipped");
});

test("one size cap: the gate, its message and docs/deployment.md state the same limits", async () => {
  expect(workerSizeFindings(WORKER_RAW_BUDGET_BYTES)).toEqual([]);
  const [finding] = workerSizeFindings(WORKER_RAW_BUDGET_BYTES + 1);
  expect(finding).toContain("WORKER_BUNDLE_SIZE");
  expect(finding).toContain(`${WORKER_RAW_BUDGET_BYTES} byte`);
  expect(finding).toContain("64 MiB");
  expect(WORKER_PLATFORM_LIMIT_BYTES).toBe(64 * 1024 * 1024);

  const docs = await Bun.file(join(import.meta.dir, "../../../../docs/deployment.md")).text();
  expect(docs).toContain("64 MiB");
  expect(docs).toContain(`${WORKER_RAW_BUDGET_BYTES / (1024 * 1024)} MiB`);
  expect(docs).not.toMatch(/3 MiB gzip|caps (?:a|the) script at 3 MiB/);
});

test("the real Worker graph does not contain the Scalar reference", async () => {
  const root = join(import.meta.dir, "../../../..");
  const { findings } = await scanWorkerGraph(root, "templates/apps/server/bootstrap/cloudflare-entry.ts");
  expect(findings.filter((finding) => finding.includes("WORKER_FORBIDDEN_PACKAGE"))).toEqual([]);
});
