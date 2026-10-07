import { expect, test } from "bun:test";
import type { DevelopmentEnvironment } from "../../cli/lib/development-environment.ts";
import { runDev } from "../../cli/tasks/dev.ts";

/**
 * The API fixture prints the same structured event `bootstrap/server.ts` emits, then keeps
 * running the way `bun --watch` does after a boot crash. Readiness must never become true.
 */
const CRASHING_API_ENTRY = `process.stderr.write('{"event":"boot.failed","error":"migration ledger mismatch","pgCode":"42P10","hint":"database schema is out of date with the catalog; run \`bun erp db:status\`"}\\n');\nawait new Promise(() => {});\n`;

test("an API that fails at boot stops the stack before Vite is spawned", async () => {
  const root = `${import.meta.dir}/../../../../.data/dev-orchestration-${crypto.randomUUID()}`;
  await Bun.$`mkdir -p ${root}/apps/server/bootstrap ${root}/apps/web`.quiet();
  await Bun.write(`${root}/apps/server/bootstrap/crash.ts`, CRASHING_API_ENTRY);
  // apps/web exists on purpose: the orchestrator must not spawn Vite even though it could.
  await Bun.write(`${root}/apps/web/package.json`, "{}\n");

  const development: DevelopmentEnvironment = {
    apiPort: 3997,
    webPort: 5997,
    webUrl: "http://localhost:5997",
    readyTimeoutMs: 5_000,
    server: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? "",
    },
    web: {},
  };
  const spawned: string[][] = [];
  const started = Date.now();

  try {
    const code = await runDev({
      root,
      development,
      apiEntry: "bootstrap/crash.ts",
      spawn: (command, options) => {
        spawned.push(command);
        return Bun.spawn(command, options);
      },
    });

    expect(code).not.toBe(0);
    // The boot.failed event must fail fast, not sit out the readiness timeout.
    expect(Date.now() - started).toBeLessThan(development.readyTimeoutMs);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.join(" ")).toContain("bootstrap/crash.ts");
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});
