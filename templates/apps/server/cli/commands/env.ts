import { resolve } from "node:path";
import { applyCloudflareVars, parseEnvFile, splitCloudflareEnv } from "@cli/lib/cloudflare.ts";
import { parseCommandOptions } from "@cli/lib/options.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { defineCommand } from "@cli/registry.ts";
import { loadEnv, strayKeyWarnings } from "../../config/index.ts";

/** Where the git-ignored `wrangler secret bulk` file is written. */
const SECRETS_FILE = ".data/cloudflare-secrets.json";

export const commands = [
  defineCommand("env:cloudflare", async (args) => {
    const options = parseCommandOptions(args, { flags: ["write"], values: ["env-file"] });
    const envFile = options.values.get("env-file") ?? ".env";
    const file = Bun.file(resolve(repoRoot, envFile));
    if (!(await file.exists())) {
      process.stderr.write(`${envFile} not found.\n`);
      process.exit(1);
    }
    const { vars, secrets, skipped } = splitCloudflareEnv(parseEnvFile(await file.text()));
    await Bun.write(resolve(repoRoot, SECRETS_FILE), `${JSON.stringify(secrets, null, 2)}\n`);
    process.stdout.write(
      `Secrets (${Object.keys(secrets).length}) written to ${SECRETS_FILE} (git-ignored; values not shown):\n`,
    );
    for (const key of Object.keys(secrets)) process.stdout.write(`  ${key}\n`);
    if (skipped.length > 0)
      process.stdout.write(`Not pushed (the Worker reads it from Hyperdrive): ${skipped.join(", ")}\n`);
    process.stdout.write(`Push with: bun run --cwd apps/web wrangler secret bulk ../../${SECRETS_FILE}\n`);

    if (options.flags.has("write")) {
      const wrangler = Bun.file(resolve(repoRoot, "wrangler.jsonc"));
      await Bun.write(wrangler, applyCloudflareVars(await wrangler.text(), vars));
      process.stdout.write(`wrangler.jsonc vars updated (${Object.keys(vars).length} keys).\n`);
    } else {
      process.stdout.write(
        `wrangler.jsonc vars (${Object.keys(vars).length} keys) not changed; pass --write to merge them.\n`,
      );
    }
  }),

  defineCommand("env:list", async () => {
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
  }),

  defineCommand("key:generate", async () => {
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
  }),
];
