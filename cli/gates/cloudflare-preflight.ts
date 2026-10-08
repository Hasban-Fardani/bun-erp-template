import { isSecretKey, MIN_PAID_CPU_MS } from "../lib/cloudflare.ts";

type PreflightEnvironment = {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  CLOUDFLARE_APP_URL?: string;
};

type WranglerConfig = {
  hyperdrive?: Array<{ id?: string }>;
  vars?: Record<string, string>;
  limits?: { cpu_ms?: number };
  r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
  ai?: { binding?: string };
  assets?: {
    not_found_handling?: string;
    run_worker_first?: string[];
  };
};

type HyperdriveConfig = {
  id?: string;
  origin?: { host?: string; port?: number; database?: string; scheme?: string };
  caching?: { disabled?: boolean };
};

type HyperdriveResponse = { success?: boolean; result?: HyperdriveConfig };

/** Checks local deploy inputs and the live Hyperdrive resource before CI runs migrations. */
export async function validateCloudflarePreflight(
  env: PreflightEnvironment,
  config: WranglerConfig,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<string[]> {
  const required = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "CLOUDFLARE_APP_URL",
  ] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) return [`Missing required deployment values: ${missing.join(", ")}.`];

  const findings: string[] = [];
  const vars = config.vars ?? {};
  const cpuLimit = config.limits?.cpu_ms;
  // PASSWORD_HASH defaults to pbkdf2 (fits Workers Free); only scrypt (~110 ms CPU) needs a Paid CPU budget.
  const passwordHash = vars.PASSWORD_HASH ?? "pbkdf2";
  if (!["pbkdf2", "scrypt"].includes(passwordHash)) {
    findings.push(`PASSWORD_HASH must be pbkdf2 or scrypt (got ${passwordHash}).`);
  }
  if (
    vars.APP_ENV === "production" &&
    passwordHash === "scrypt" &&
    (!Number.isInteger(cpuLimit) || (cpuLimit ?? 0) < MIN_PAID_CPU_MS)
  ) {
    findings.push(
      `PASSWORD_HASH=scrypt on Cloudflare requires Workers Paid: set limits.cpu_ms to at least ${MIN_PAID_CPU_MS} (scrypt costs ~110 ms CPU; Workers Free allows 10 ms), or use PASSWORD_HASH=pbkdf2.`,
    );
  }
  findings.push(...storageFindings(vars, config.r2_buckets));
  // The assistant defaults to Workers AI; on a Worker it only reaches it through the binding.
  const aiBinding = vars.AI_BINDING || "AI";
  if ((vars.AI_DRIVER ?? "workers-ai") === "workers-ai" && config.ai?.binding !== aiBinding) {
    findings.push(
      `AI_DRIVER=workers-ai needs "ai": { "binding": "${aiBinding}" } in wrangler.jsonc, or set AI_DRIVER=openai|off.`,
    );
  }
  const plaintextSecrets = Object.entries(vars)
    .filter(([key, value]) => isSecretKey(key) && value !== "")
    .map(([key]) => key);
  if (plaintextSecrets.length > 0) {
    findings.push(
      `Secret-class keys must not sit in wrangler.jsonc vars: ${plaintextSecrets.join(", ")}. Push them with wrangler secret bulk (bun erp env:cloudflare).`,
    );
  }
  if (config.assets?.not_found_handling !== "single-page-application") {
    findings.push("Keep assets.not_found_handling set to single-page-application for file-based web routes.");
  }
  const workerFirst = config.assets?.run_worker_first ?? [];
  if (
    !workerFirst.includes("/api") ||
    !workerFirst.includes("/api/*") ||
    workerFirst.some((path) => path !== "/api" && path !== "/api/*")
  ) {
    findings.push("Run the Worker only for /api and /api/* so frontend assets bypass Worker request quotas.");
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  if (!/^[a-f0-9]{32}$/i.test(accountId) || /^0+$/.test(accountId)) {
    findings.push("CLOUDFLARE_ACCOUNT_ID must be a valid Cloudflare account ID.");
  }

  const hyperdriveId = config.hyperdrive?.[0]?.id ?? "";
  if (!/^[a-f0-9]{32}$/i.test(hyperdriveId) || /^0+$/.test(hyperdriveId)) {
    findings.push("Set a valid Hyperdrive ID in wrangler.jsonc before deployment.");
  }

  const appUrl = env.CLOUDFLARE_APP_URL ?? "";
  const trusted = (vars.AUTH_TRUSTED_ORIGINS ?? "").split(",").map((origin) => origin.trim());
  if (
    !appUrl.startsWith("https://") ||
    vars.APP_URL !== appUrl ||
    vars.BETTER_AUTH_URL !== appUrl ||
    !trusted.includes(appUrl)
  ) {
    findings.push("CLOUDFLARE_APP_URL, APP_URL, BETTER_AUTH_URL and AUTH_TRUSTED_ORIGINS must match.");
  }

  if ((env.BETTER_AUTH_SECRET ?? "").length < 32) {
    findings.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }

  let databaseUrl: URL | undefined;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
      !databaseUrl.hostname ||
      !databaseUrl.pathname.replace(/^\/+/, "")
    ) {
      databaseUrl = undefined;
    }
  } catch {
    databaseUrl = undefined;
  }
  if (!databaseUrl) findings.push("DATABASE_URL must identify a PostgreSQL host and database.");

  if (findings.length > 0) return findings;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${hyperdriveId}`;
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    });
  } catch {
    return ["Could not verify the Hyperdrive resource with the Cloudflare API."];
  }
  if (!response.ok) {
    const permission =
      response.status === 401 || response.status === 403 ? " Check the token's Hyperdrive Read permission." : "";
    return [`Could not verify the Hyperdrive resource (Cloudflare API returned HTTP ${response.status}).${permission}`];
  }

  let hyperdrive: HyperdriveConfig | undefined;
  try {
    const payload = (await response.json()) as HyperdriveResponse;
    if (payload.success) hyperdrive = payload.result;
  } catch {
    return ["Cloudflare returned an unreadable Hyperdrive configuration."];
  }
  if (!hyperdrive || hyperdrive.id?.toLowerCase() !== hyperdriveId.toLowerCase()) {
    return ["The Hyperdrive ID could not be verified in the configured Cloudflare account."];
  }

  if (hyperdrive.caching?.disabled !== true) {
    findings.push("Disable Hyperdrive query caching; cached session and permission reads can be stale.");
  }

  const origin = hyperdrive.origin;
  if (!origin || !databaseUrl) {
    findings.push("Hyperdrive must have a PostgreSQL origin matching DATABASE_URL.");
    return findings;
  }

  const expectedHost = normalizeHost(databaseUrl.hostname);
  const actualHost = normalizeHost(origin.host ?? "");
  const expectedPort = Number(databaseUrl.port || "5432");
  const actualPort = Number(origin.port);
  const expectedDatabase = decodePath(databaseUrl.pathname);
  const actualDatabase = origin.database ?? "";
  const expectedScheme = normalizePostgresScheme(databaseUrl.protocol);
  const actualScheme = normalizePostgresScheme(origin.scheme ?? "");
  if (
    expectedHost !== actualHost ||
    expectedPort !== actualPort ||
    expectedDatabase !== actualDatabase ||
    expectedScheme !== actualScheme
  ) {
    findings.push("Hyperdrive origin host, port, database and PostgreSQL scheme must match DATABASE_URL.");
  }

  return findings;
}

function storageFindings(vars: Record<string, string>, buckets: WranglerConfig["r2_buckets"]): string[] {
  const driver = vars.STORAGE_DRIVER;
  if (driver === "s3") {
    return ["STORAGE_DRIVER=s3 is not supported on Cloudflare (it needs Bun.S3Client); use r2."];
  }
  if (driver !== "r2") return [];
  const binding = vars.STORAGE_R2_BINDING || "STORAGE";
  const findings: string[] = [];
  if (!buckets?.some((bucket) => bucket.binding === binding && bucket.bucket_name)) {
    findings.push(
      `STORAGE_DRIVER=r2 needs an r2_buckets entry in wrangler.jsonc with binding "${binding}" and a bucket_name.`,
    );
  }
  // The Worker only runs for /api and /api/*, so the private file route must be served from there.
  let publicPath = "";
  try {
    publicPath = new URL(vars.STORAGE_PUBLIC_URL ?? "").pathname.replace(/\/+$/, "");
  } catch {
    publicPath = "";
  }
  if (publicPath !== "/api/v1/files") {
    findings.push(
      "STORAGE_PUBLIC_URL must end in /api/v1/files on Cloudflare (the Worker only runs for /api and /api/*).",
    );
  }
  return findings;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path.replace(/^\/+/, ""));
  } catch {
    return path.replace(/^\/+/, "");
  }
}

function normalizePostgresScheme(scheme: string): string {
  const value = scheme.replace(/:$/, "").toLowerCase();
  return value === "postgres" || value === "postgresql" ? "postgresql" : value;
}
