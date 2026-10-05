import * as z from "zod";

/**
 * The final schema is compiled once when the module loads (PRD §5 rule).
 * Compile after every refine is attached — never inside a handler.
 */

const boolOr = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

const timezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid IANA timezone" },
);

const rawSchema = z
  .strictObject({
    // Application
    APP_NAME: z.string().trim().min(1).max(120),
    APP_ENV: z.enum(["development", "test", "production"]),
    APP_URL: z.url(),
    APP_PORT: z.coerce.number().int().min(1).max(65535),
    APP_RELEASE: z.string().trim().min(1).max(120),
    APP_TIMEZONE: timezone,
    APP_DEPLOY_TARGET: z.enum(["bun", "cloudflare"]).default("bun"),
    APP_WEB_MODE: z.enum(["integrated", "separate"]).default("integrated"),

    // Log
    LOG_DRIVER: z.enum(["console", "daily"]),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
    LOG_PATH: z.string().trim().min(1),
    LOG_RETENTION_DAYS: z.coerce.number().int().positive(),
    LOG_MAX_SIZE_MB: z.coerce.number().int().positive(),
    TRUST_PROXY: boolOr("false"),

    // Database
    DATABASE_DRIVER: z.literal("postgres").default("postgres"),
    DATABASE_URL: z.string().trim().default(""),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("disable"),

    // Auth
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().default(""),
    AUTH_TRUSTED_ORIGINS: z.string().default(""),
    // Google OAuth dormant (ADR-0009): the provider activates only when BOTH are set.
    GOOGLE_CLIENT_ID: z.string().default(""),
    GOOGLE_CLIENT_SECRET: z.string().default(""),

    // Storage: local is dev/test only. s3 uses Bun.S3Client; r2 uses a Cloudflare binding.
    STORAGE_DRIVER: z.enum(["local", "s3", "r2", "memory"]),
    STORAGE_LOCAL_ROOT: z.string().trim().min(1).default(".data/storage"),
    /** Public base for object URLs; R2 requires it, S3 falls back to presigned URLs when empty. */
    STORAGE_PUBLIC_URL: z.string().trim().default(""),
    /** Worker binding name for the r2 driver. */
    STORAGE_R2_BINDING: z.string().trim().default("STORAGE"),
    S3_BUCKET: z.string().trim().default(""),
    S3_REGION: z.string().trim().default("auto"),
    S3_ENDPOINT: z.string().trim().default(""),
    S3_ACCESS_KEY_ID: z.string().trim().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: boolOr("false"),

    // Mail
    MAIL_DRIVER: z.enum(["log", "smtp"]),
    MAIL_FROM_ADDRESS: z.string().trim().min(1),
    MAIL_FROM_NAME: z.string().trim().min(1),
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolOr("false"),
    SMTP_USERNAME: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),

    // Feature flags
    FEATURE_ADVANCED_REPORTS: boolOr("false"),
  })
  .superRefine((env, ctx) => {
    // Cross-field: variables required only under a specific driver/mode.
    if (env.APP_DEPLOY_TARGET === "cloudflare" && env.APP_WEB_MODE !== "integrated") {
      ctx.addIssue({
        code: "custom",
        path: ["APP_WEB_MODE"],
        message: "Cloudflare currently requires integrated Workers Static Assets hosting",
      });
    }
    if (env.DATABASE_URL === "") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required for the PostgreSQL database" });
    }
    if (env.MAIL_DRIVER === "smtp" && env.SMTP_HOST === "") {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required when MAIL_DRIVER=smtp" });
    }
    if (env.APP_DEPLOY_TARGET === "cloudflare" && env.MAIL_DRIVER === "smtp") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message: "SMTP needs raw sockets; use log or an HTTP mail driver on Cloudflare Workers",
      });
    }
    if (env.APP_ENV !== "production") return;

    // APP_ENV=production rejects unsafe configuration.
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "debug/trace logging is refused in production" });
    }
    if (env.STORAGE_DRIVER === "local") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "local storage is refused in production" });
    }
    if (env.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "must be at least 32 characters in production (run: bun erp key:generate)",
      });
    }
    if (!env.APP_URL.startsWith("https://") && !env.APP_URL.startsWith("http://localhost")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "public URL must use https in production" });
    }
    // Hybrid (ADR-0011): auth may live on another domain as long as that origin is explicitly trusted.
    const trustedOrigins = env.AUTH_TRUSTED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (env.BETTER_AUTH_URL !== env.APP_URL && !trustedOrigins.includes(env.BETTER_AUTH_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "must equal APP_URL or be listed in AUTH_TRUSTED_ORIGINS in production",
      });
    }
  });

export const EnvSchema = z.compile(rawSchema);

/** Raw definitions are exported for the parity test and for re-reading keys (F1.16). */
export { rawSchema as EnvRawSchema };

/** Every key the schema knows — used to filter Bun.env and report foreign keys. */
export const envKeys: readonly string[] = Object.freeze(
  Object.keys((rawSchema as unknown as { def: { shape: Record<string, unknown> } }).def.shape),
);

export type RawEnv = z.output<typeof EnvSchema>;

/** An app-prefixed key the schema does not know = a typo / dead variable. */
export function findStrayKeys(env: Record<string, string | undefined>): string[] {
  const prefixes = [
    "APP_",
    "LOG_",
    "DATABASE_",
    "BETTER_AUTH_",
    "AUTH_",
    "GOOGLE_",
    "STORAGE_",
    "S3_",
    "MAIL_",
    "SMTP_",
    "FEATURE_",
  ];
  return Object.keys(env)
    .filter((k) => prefixes.some((p) => k.startsWith(p)) && !envKeys.includes(k))
    .sort();
}
