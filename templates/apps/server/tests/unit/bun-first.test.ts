import { expect, test } from "bun:test";
import { checkBunFirst } from "../../../../cli/gates/bun-first.ts";
import { withTempRoot } from "./support/temp-root.ts";

/** Assembled at runtime so this test file itself stays free of the imports it plants in fixtures. */
const nodeModule = (name: string) => `node:${name}`;

test("flags sync fs readers, existsSync and node:child_process", async () => {
  await withTempRoot(
    {
      "packages/probe/src/sync-fs.ts": `import { readFileSync } from "${nodeModule("fs")}";\n`,
      "packages/probe/src/child.ts": `import { spawn } from "${nodeModule("child_process")}";\n`,
      "packages/probe/src/exists.ts": `import { existsSync } from "${nodeModule("fs")}";\n`,
    },
    async (root) => {
      const findings = (await checkBunFirst(root)).join("\n");
      expect(findings).toContain("readFileSync");
      expect(findings).toContain("node:child_process");
      expect(findings).toContain("existsSync");
    },
    "bun-first-",
  );
});

test("flags node:crypto helpers, promisify and the packages Bun replaces", async () => {
  await withTempRoot(
    {
      "cli/commands/probe.ts": `import { randomUUID, createHash } from "${nodeModule("crypto")}";\n`,
      "packages/probe/src/util.ts": `import { promisify } from "${nodeModule("util")}";\n`,
      "packages/probe/src/env.ts": 'import "dotenv/config";\n',
      "packages/probe/src/fetch.ts": 'import fetch from "node-fetch";\n',
    },
    async (root) => {
      const report = (await checkBunFirst(root)).join("\n");
      for (const banned of ["randomUUID", "createHash", "promisify", "dotenv", "node-fetch"]) {
        expect(report).toContain(banned);
      }
    },
    "bun-first-replaced-",
  );
});

test("allows the documented node: exceptions", async () => {
  const allowed = [
    `import { join } from "${nodeModule("path")}";`,
    `import { tmpdir } from "${nodeModule("os")}";`,
    `import { pathToFileURL } from "${nodeModule("url")}";`,
    `import { mkdir, rm, mkdtemp, stat, readdir } from "${nodeModule("fs/promises")}";`,
    "",
  ].join("\n");
  await withTempRoot(
    { "packages/probe/src/allowed.ts": allowed },
    async (root) => {
      expect(await checkBunFirst(root)).toEqual([]);
    },
    "bun-first-allowed-",
  );
});

test("exempts the vendored governance validators and the Worker graph", async () => {
  const exempt = {
    "cli/gates/governance/slop-validator.ts": `import { readFileSync } from "${nodeModule("fs")}";\n`,
    "templates/apps/server/bootstrap/worker.ts": `import { spawn } from "${nodeModule("child_process")}";\n`,
  };
  await withTempRoot(
    exempt,
    async (root) => {
      expect(await checkBunFirst(root)).toEqual([]);
    },
    "bun-first-exempt-",
  );
});
