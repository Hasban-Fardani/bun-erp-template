import { EnvSchema, envKeys, findStrayKeys, type RawEnv } from "./schema.ts";

export type { RawEnv };

export type Env = RawEnv & {
  isProduction: boolean;
  isTest: boolean;
  isDevelopment: boolean;
  trustedOrigins: string[];
  /** Safe values to display/log: never carry a secret. */
  safeSummary: Record<string, string>;
};

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

const SECRET_KEYS = new Set(["BETTER_AUTH_SECRET", "SMTP_PASSWORD", "DATABASE_URL", "GOOGLE_CLIENT_SECRET"]);

function describe(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (SECRET_KEYS.has(key)) return value ? "set" : "empty";
  if (value === undefined || value === "") return "<unset>";
  return String(value);
}

function shape(parsed: RawEnv): Env {
  const values = parsed as unknown as Record<string, unknown>;
  return Object.freeze({
    ...parsed,
    isProduction: parsed.APP_ENV === "production",
    isTest: parsed.APP_ENV === "test",
    isDevelopment: parsed.APP_ENV === "development",
    trustedOrigins: parsed.AUTH_TRUSTED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    safeSummary: Object.freeze(Object.fromEntries(envKeys.map((k) => [k, describe(values, k)]))),
  }) as Env;
}

/**
 * `Bun.env` holds the whole OS environment (PATH, HOME, deployment vars). Only keys that
 * belong to the schema reach the parser — the rest are ignored, not treated as bad config.
 */
function pickKnownKeys(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const picked: Record<string, string | undefined> = {};
  for (const key of envKeys) {
    const value = source[key];
    if (value !== undefined && value !== "") picked[key] = value;
  }
  return picked;
}

/**
 * The only reader of Bun.env in the whole app (PRD §6).
 * Throws ConfigError at bootstrap when config is invalid — not on the first request.
 */
export function loadEnv(
  source: Record<string, string | undefined> = Bun.env as Record<string, string | undefined>,
): Env {
  const result = EnvSchema.safeParse(pickKnownKeys(source));
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return shape(result.data);
}

/** Used by `env:list` and the bootstrap error message: a foreign key is a typo or a dead variable. */
export function strayKeyWarnings(
  source: Record<string, string | undefined> = Bun.env as Record<string, string | undefined>,
): string[] {
  const strays = findStrayKeys(source);
  return strays.map((k) => `${k}: not recognised by the config schema (typo or unused variable?)`);
}
