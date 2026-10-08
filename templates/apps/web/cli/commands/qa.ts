import { parseCommandOptions } from "@cli/lib/options.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { defineCommand } from "@cli/registry.ts";

/**
 * `bun erp qa` lives in the web app so the registry lists it only while `apps/web` is installed.
 * The root CLI never imports app code: the runner is spawned as a subprocess and owns its flags.
 */
export const commands = [
  defineCommand("qa", async (args) => {
    // Validate here so a typo fails before a browser is launched; the runner re-reads the same flags.
    parseCommandOptions(args, { flags: ["list", "dry-run", "help"], values: ["only"] });
    const proc = Bun.spawn(["bun", "apps/web/tests/browser/qa.ts", ...args], {
      cwd: repoRoot,
      stdio: ["inherit", "inherit", "inherit"],
    });
    process.exitCode = await proc.exited;
  }),
];
