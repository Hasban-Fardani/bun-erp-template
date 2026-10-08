import { resolve } from "node:path";
import { repoRoot, run } from "./repo.ts";

export function deploymentTarget(): "bun" | "cloudflare" {
  const target = process.env.APP_DEPLOY_TARGET ?? "bun";
  if (target !== "bun" && target !== "cloudflare") {
    throw new Error(`Unsupported APP_DEPLOY_TARGET=${target}. Implemented targets: bun, cloudflare.`);
  }
  return target;
}

export async function buildCloudflare(): Promise<void> {
  const webMode = process.env.APP_WEB_MODE ?? "integrated";
  if (webMode !== "integrated") {
    throw new Error("Cloudflare currently requires APP_WEB_MODE=integrated.");
  }

  const generatedLocalBindings = resolve(repoRoot, "apps/web/dist/bun_erp_template/.dev.vars");
  try {
    await run(["bun", "run", "--cwd", "apps/web", "build:cloudflare"], "Cloudflare Worker build");
  } finally {
    // The Vite plugin can materialize values from a local .env for development; they never belong in deploy output.
    await Bun.$`rm -f ${generatedLocalBindings}`.quiet();
  }
}

/**
 * Lowest `limits.cpu_ms` a production deploy may declare while sign-in hashes with scrypt
 * (`PASSWORD_HASH=scrypt`). Workers Free is fixed at 10 ms CPU per invocation and Workers Paid
 * defaults to 30 s (max 5 min, checked against the Workers limits page via Context7 on 2026-10-08).
 * scrypt measured ~110 ms CPU locally, so 200 ms leaves headroom without implying the Free plan can
 * run it. The default `pbkdf2` (~2-4 ms) fits Workers Free and has no floor.
 */
export const MIN_PAID_CPU_MS = 200;

/** Keys that are always secret. `DATABASE_URL` is secret-class even though the Worker never receives it. */
const SECRET_KEYS = new Set(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
const SECRET_SUFFIX = /(?:_SECRET|_PASSWORD|_API_KEY|_ACCESS_KEY_ID|_SECRET_ACCESS_KEY|_TOKEN|_PRIVATE_KEY)$/;

/** Secret-class keys must reach the Worker through `wrangler secret`, never through plaintext vars. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key) || SECRET_SUFFIX.test(key);
}

/** The Worker gets its database connection string from the Hyperdrive binding, not from a secret. */
const WORKER_UNUSED_SECRETS = new Set(["DATABASE_URL"]);

const APP_ENV_PREFIXES = [
  "APP_",
  "API_",
  "LOG_",
  "DATABASE_",
  "BETTER_AUTH_",
  "AUTH_",
  "PERMISSION_",
  "GOOGLE_",
  "STORAGE_",
  "S3_",
  "MAIL_",
  "SMTP_",
  "JOBS_",
  "FEATURE_",
];

export type CloudflareEnvSplit = {
  vars: Record<string, string>;
  secrets: Record<string, string>;
  /** Secret-class keys deliberately not pushed to the Worker. */
  skipped: string[];
};

/** Splits an `.env` map into wrangler vars and a `wrangler secret bulk` map. Empty values are dropped. */
export function splitCloudflareEnv(env: Record<string, string | undefined>): CloudflareEnvSplit {
  const vars: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === "") continue;
    if (!APP_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (!isSecretKey(key)) {
      vars[key] = value;
    } else if (WORKER_UNUSED_SECRETS.has(key)) {
      skipped.push(key);
    } else {
      secrets[key] = value;
    }
  }
  return { vars, secrets, skipped };
}

/** Index just past the `}` that closes the object opened at `open`, skipping strings and comments. */
function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      i += 1;
      while (i < source.length && source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
    } else if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
    } else if (char === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i === -1) break;
      i += 1;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("wrangler.jsonc has an unterminated vars block.");
}

/** Merges `next` into the top-level `vars` object of a JSONC document and keeps every other byte. */
export function applyCloudflareVars(source: string, next: Record<string, string>): string {
  const match = /^[ \t]*"vars"\s*:\s*\{/m.exec(source);
  if (!match) throw new Error('wrangler.jsonc has no "vars" block.');
  const open = match.index + match[0].length - 1;
  const close = matchingBrace(source, open);
  const current = Bun.JSONC.parse(source.slice(open, close)) as Record<string, string>;
  const merged = { ...current, ...next };
  const body = Object.entries(merged)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(",\n");
  return `${source.slice(0, open)}{\n${body}\n  }${source.slice(close)}`;
}

/** Minimal dotenv reader: `KEY=value`, optional `export`, single/double quotes, `#` comments. */
export function parseEnvFile(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!match?.[1]) continue;
    let value = match[2] ?? "";
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
}
