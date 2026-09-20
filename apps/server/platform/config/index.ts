import { EnvSchema, envKeys, findStrayKeys, type RawEnv } from "./schema.ts";

export type { RawEnv };

export type Env = RawEnv & {
  isProduction: boolean;
  isTest: boolean;
  isDevelopment: boolean;
  trustedOrigins: string[];
  /** Nilai aman untuk ditampilkan/di-log: tidak pernah memuat secret. */
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

const SECRET_KEYS = new Set(["BETTER_AUTH_SECRET", "SMTP_PASSWORD", "DATABASE_URL"]);

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
 * `Bun.env` memuat seluruh environment OS (PATH, HOME, variabel deployment). Hanya key
 * milik schema yang diserahkan ke parser — sisanya diabaikan, bukan dianggap salah config.
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
 * Satu-satunya pembaca Bun.env di seluruh aplikasi (PRD §6).
 * Melempar ConfigError saat bootstrap bila config invalid — bukan saat request pertama.
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

/** Dipakai `env:list` dan pesan error bootstrap: key asing = salah ketik atau variabel mati. */
export function strayKeyWarnings(
  source: Record<string, string | undefined> = Bun.env as Record<string, string | undefined>,
): string[] {
  const strays = findStrayKeys(source);
  return strays.map((k) => `${k}: not recognised by the config schema (typo or unused variable?)`);
}
