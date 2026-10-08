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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `https` anywhere, or plain `http` on a loopback hostname only (parsed, never prefix-matched). */
function isSecurePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

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
    /**
     * Public `/api/docs` + `/api/openapi.json`. Unset defaults to enabled outside production
     * and disabled in production; `true`/`false` overrides that explicitly.
     */
    API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),

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
    /** Public email/password self sign-up. Off by default: admins create accounts (CLI `user:create`). */
    // Hash for new passwords: pbkdf2 fits Workers Free (10 ms CPU), scrypt is memory-hard for hosts without a CPU cap.
    PASSWORD_HASH: z.enum(["pbkdf2", "scrypt"]).default("pbkdf2"),
    // pbkdf2 only; workerd rejects more than 100,000 iterations, so the cap holds on every target.
    PASSWORD_HASH_ITERATIONS: z.coerce.number().int().min(1000).max(100000).default(30000),
    AUTH_SIGNUP_ENABLED: boolOr("false"),
    /** Email/password sign-in. Turn it off for Google-only sign-in (needs GOOGLE_CLIENT_ID/SECRET). */
    AUTH_PASSWORD_ENABLED: boolOr("true"),
    /** Better Auth rate limiting; the auth endpoints keep their stricter built-in rules. */
    AUTH_RATE_LIMIT_ENABLED: boolOr("true"),
    /**
     * Business API limiter on `/api/v1/*` (PostgreSQL fixed window, keyed by user id, else client
     * address). Better Auth keeps its own stricter limits on the auth endpoints.
     */
    API_RATE_LIMIT_ENABLED: boolOr("true"),
    /**
     * User impersonation (docs/security.md). `IMPERSONATION_ENABLED=false` turns the start endpoint off
     * entirely (production kill switch); a session lasts at most IMPERSONATION_TTL_MINUTES.
     */
    IMPERSONATION_ENABLED: boolOr("true"),
    IMPERSONATION_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    /**
     * Per-process permission cache. On for single-process dev; set false for Cloudflare Workers
     * and multi-replica Bun, where an invalidation only reaches the process that wrote it.
     * See docs/security.md.
     */
    PERMISSION_CACHE_ENABLED: boolOr("true"),
    /**
     * Cache facade driver (infra/cache). `memory` is per process; `database` is shared across
     * replicas and isolates; `cloudflare-kv` needs the Worker binding named by CACHE_KV_BINDING and
     * is eventually consistent, so it is never used for permissions.
     */
    CACHE_DRIVER: z.enum(["memory", "database", "cloudflare-kv"]).default("memory"),
    CACHE_KV_BINDING: z.string().trim().min(1).default("CACHE_KV"),
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

    // Mail: consumed by the opt-in @bun-erp/mail package (`bun erp features:install mail`).
    // The keys stay in the core schema so one validated environment serves every install.
    MAIL_DRIVER: z.enum(["log", "smtp", "http"]),
    MAIL_FROM_ADDRESS: z.string().trim().min(1),
    MAIL_FROM_NAME: z.string().trim().min(1),
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolOr("false"),
    SMTP_USERNAME: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),
    /** `http` driver adapter; only `resend` ships. Works on Bun and Cloudflare Workers. */
    MAIL_HTTP_PROVIDER: z.enum(["resend"]).default("resend"),
    MAIL_API_KEY: z.string().default(""),

    // Jobs: `none` polls the database (Bun worker and Cloudflare cron sweeper); `cloudflare-queue`
    // sends a wake-up through the JOBS_QUEUE binding after each committed enqueue.
    JOBS_WAKEUP_DRIVER: z.enum(["none", "cloudflare-queue"]).default("none"),

    // AI assistant (docs/ai.md). `workers-ai` uses the Worker binding on Cloudflare and the same
    // models over REST (AI_ACCOUNT_ID + AI_API_KEY) on Bun; `openai` is any OpenAI-compatible API.
    AI_DRIVER: z.enum(["workers-ai", "openai", "fake", "off"]).default("workers-ai"),
    /** Empty = the driver default (`@cf/meta/llama-3.1-8b-instruct-fast` on Workers AI). */
    AI_MODEL: z.string().trim().default(""),
    AI_BINDING: z.string().trim().default("AI"),
    AI_ACCOUNT_ID: z.string().trim().default(""),
    AI_API_KEY: z.string().default(""),
    AI_BASE_URL: z.url().default("https://api.openai.com/v1"),
    AI_MAX_TOKENS: z.coerce.number().int().min(16).max(4096).default(768),
    /** Questions per user per UTC day; caps provider spend (Workers Free: 10,000 Neurons a day). */
    AI_DAILY_LIMIT: z.coerce.number().int().min(1).default(50),

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
    const googleKeys = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET].filter((value) => value !== "").length;
    if (googleKeys === 1) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together",
      });
    }
    if (!env.AUTH_PASSWORD_ENABLED && googleKeys < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_PASSWORD_ENABLED"],
        message: "false needs Google sign-in (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET), or nobody can sign in",
      });
    }
    if (env.AI_DRIVER === "openai") {
      if (env.AI_API_KEY === "")
        ctx.addIssue({ code: "custom", path: ["AI_API_KEY"], message: "required when AI_DRIVER=openai" });
      if (env.AI_MODEL === "")
        ctx.addIssue({ code: "custom", path: ["AI_MODEL"], message: "required when AI_DRIVER=openai" });
    }
    if (env.AI_DRIVER === "workers-ai" && (env.AI_ACCOUNT_ID === "") !== (env.AI_API_KEY === "")) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_API_KEY"],
        message: "set AI_ACCOUNT_ID and AI_API_KEY together for Workers AI over REST",
      });
    }
    if (env.DATABASE_URL === "") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required for the PostgreSQL database" });
    }
    if (env.MAIL_DRIVER === "smtp" && env.SMTP_HOST === "") {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required when MAIL_DRIVER=smtp" });
    }
    if (env.MAIL_DRIVER === "http" && env.MAIL_API_KEY === "") {
      ctx.addIssue({ code: "custom", path: ["MAIL_API_KEY"], message: "required when MAIL_DRIVER=http" });
    }
    if (env.APP_DEPLOY_TARGET === "cloudflare" && env.MAIL_DRIVER === "smtp") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message: "SMTP needs raw sockets; use MAIL_DRIVER=http (Resend) on Cloudflare Workers",
      });
    }
    if (env.CACHE_DRIVER === "cloudflare-kv" && env.APP_DEPLOY_TARGET !== "cloudflare") {
      ctx.addIssue({
        code: "custom",
        path: ["CACHE_DRIVER"],
        message: "cloudflare-kv needs a Worker binding; use memory or database on Bun",
      });
    }
    // Every target needs a real signing secret; only local development may run without one.
    if (env.APP_ENV !== "development" && env.BETTER_AUTH_SECRET === "") {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "must not be empty outside development (run: bun erp key:generate)",
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
    if (!isSecurePublicUrl(env.APP_URL)) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "public URL must use https in production" });
    }
    // Hyperdrive terminates TLS on Cloudflare; on Bun the database connection carries it.
    if (env.DATABASE_SSL_MODE === "disable" && env.APP_DEPLOY_TARGET !== "cloudflare") {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_SSL_MODE"],
        message: "disable is refused in production on Bun; use require or verify-full",
      });
    }
    if (!env.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "must use https in production",
      });
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
    "AI_",
    "FEATURE_",
  ];
  return Object.keys(env)
    .filter((k) => prefixes.some((p) => k.startsWith(p)) && !envKeys.includes(k))
    .sort();
}
