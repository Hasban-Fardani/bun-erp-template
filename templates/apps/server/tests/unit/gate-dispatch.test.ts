import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectGateFindings, GATE_CATALOG, GATE_IMPLEMENTATIONS, runGate } from "../../../../cli/lib/gates.ts";
import { GateFailure } from "../../../../cli/lib/repo.ts";

test("every catalog gate has a registered implementation", () => {
  for (const { name } of GATE_CATALOG) {
    expect(typeof GATE_IMPLEMENTATIONS[name]).toBe("function");
  }
});

test("the catalog names are unique", () => {
  const names = GATE_CATALOG.map(({ name }) => name);
  expect(new Set(names).size).toBe(names.length);
});

test("migrations dispatches to its own gate and throws instead of exiting", async () => {
  const root = await mkdtemp(join(tmpdir(), "gate-dispatch-migrations-"));
  try {
    const directory = join(root, "apps/server/database/migrations");
    await mkdir(directory, { recursive: true });
    await Bun.write(join(directory, "bad-name.ts"), "");
    const findings = await collectGateFindings("migrations", root);
    expect(findings.join("\n")).toContain("NNNN_snake_case.ts");
    await expect(runGate("migrations", root)).rejects.toBeInstanceOf(GateFailure);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readiness dispatches to its own gate, not React Doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "gate-dispatch-readiness-"));
  try {
    await Bun.write(join(root, "package.json"), JSON.stringify({ scripts: {} }));
    await mkdir(join(root, ".githooks"), { recursive: true });
    await Bun.write(join(root, ".githooks/pre-push"), "");
    const findings = await collectGateFindings("readiness", root);
    expect(findings.some((finding) => finding.includes("READINESS_SCRIPTS"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
