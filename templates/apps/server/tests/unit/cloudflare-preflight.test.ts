import { describe, expect, test } from "bun:test";
import { validateCloudflarePreflight } from "@cli/gates/cloudflare-preflight.ts";
import { MIN_PAID_CPU_MS } from "@cli/lib/cloudflare.ts";

const validEnvironment = {
  CLOUDFLARE_API_TOKEN: "test-token",
  CLOUDFLARE_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
  DATABASE_URL: "postgresql://user:secret@db.example.test:5432/erp",
  BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-preflight",
  CLOUDFLARE_APP_URL: "https://erp.example.workers.dev",
};

const validConfig = {
  hyperdrive: [{ id: "abcdef1234567890abcdef1234567890" }],
  limits: { cpu_ms: 500 },
  r2_buckets: [{ binding: "STORAGE", bucket_name: "erp-files" }],
  ai: { binding: "AI" },
  assets: { not_found_handling: "single-page-application", run_worker_first: ["/api", "/api/*"] },
  vars: {
    APP_ENV: "production",
    PASSWORD_HASH: "scrypt",
    STORAGE_DRIVER: "r2",
    STORAGE_PUBLIC_URL: "https://erp.example.workers.dev/api/v1/files",
    APP_URL: "https://erp.example.workers.dev",
    BETTER_AUTH_URL: "https://erp.example.workers.dev",
    AUTH_TRUSTED_ORIGINS: "https://erp.example.workers.dev",
  },
};

function hyperdriveResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      success: true,
      result: {
        id: "abcdef1234567890abcdef1234567890",
        origin: { host: "db.example.test", port: 5432, database: "erp", scheme: "postgres" },
        caching: { disabled: true },
        ...overrides,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Cloudflare deployment preflight", () => {
  test("rejects Worker settings that break the asset routing contract", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, assets: { not_found_handling: "single-page-application", run_worker_first: ["/*"] } },
      fetcher,
    );
    expect(findings).toContain(
      "Run the Worker only for /api and /api/* so frontend assets bypass Worker request quotas.",
    );
  });

  test("fails a production deploy whose cpu_ms is below the Workers Paid threshold", async () => {
    const fetcher = async () => hyperdriveResponse();
    for (const cpu_ms of [10, MIN_PAID_CPU_MS - 1]) {
      const findings = await validateCloudflarePreflight(
        validEnvironment,
        { ...validConfig, limits: { cpu_ms } },
        fetcher,
      );
      expect(findings.join(" ")).toContain("Workers Paid");
    }
    const missing = await validateCloudflarePreflight(validEnvironment, { ...validConfig, limits: {} }, fetcher);
    expect(missing.join(" ")).toContain("Workers Paid");
  });

  test("pbkdf2 (also the default when unset) fits Workers Free: no cpu_ms floor", async () => {
    const fetcher = async () => hyperdriveResponse();
    for (const hash of ["pbkdf2", undefined]) {
      const { PASSWORD_HASH: _drop, ...rest } = validConfig.vars;
      const vars = hash ? { ...rest, PASSWORD_HASH: hash } : rest;
      const config = { ...validConfig, limits: { cpu_ms: 10 }, vars };
      expect(await validateCloudflarePreflight(validEnvironment, config, fetcher)).toEqual([]);
    }
  });

  test("scrypt on production Cloudflare still requires Workers Paid", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, limits: { cpu_ms: 10 } },
      fetcher,
    );
    expect(findings.join(" ")).toContain("PASSWORD_HASH=scrypt");
    expect(findings.join(" ")).toContain("Workers Paid");
  });

  test("accepts cpu_ms at the threshold and does not enforce it outside production", async () => {
    const fetcher = async () => hyperdriveResponse();
    const atThreshold = { ...validConfig, limits: { cpu_ms: MIN_PAID_CPU_MS } };
    expect(await validateCloudflarePreflight(validEnvironment, atThreshold, fetcher)).toEqual([]);
    const staging = {
      ...validConfig,
      limits: { cpu_ms: 10 },
      vars: { ...validConfig.vars, APP_ENV: "staging" },
    };
    expect(await validateCloudflarePreflight(validEnvironment, staging, fetcher)).toEqual([]);
  });

  test("fails when STORAGE_DRIVER=r2 has no matching r2_buckets binding", async () => {
    const fetcher = async () => hyperdriveResponse();
    const noBinding = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, r2_buckets: undefined },
      fetcher,
    );
    expect(noBinding.join(" ")).toContain("r2_buckets");
    const renamed = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, vars: { ...validConfig.vars, STORAGE_R2_BINDING: "FILES" } },
      fetcher,
    );
    expect(renamed.join(" ")).toContain("FILES");
  });

  test("the default Workers AI driver needs the ai binding; other drivers do not", async () => {
    const fetcher = async () => hyperdriveResponse();
    const missing = await validateCloudflarePreflight(validEnvironment, { ...validConfig, ai: undefined }, fetcher);
    expect(missing.join(" ")).toContain('"ai"');
    const openai = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, ai: undefined, vars: { ...validConfig.vars, AI_DRIVER: "openai" } },
      fetcher,
    );
    expect(openai.join(" ")).not.toContain('"ai"');
  });

  test("fails when the r2 public URL is outside /api, where the Worker never runs", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, vars: { ...validConfig.vars, STORAGE_PUBLIC_URL: "https://erp.example.workers.dev/files" } },
      fetcher,
    );
    expect(findings.join(" ")).toContain("/api/v1/files");
  });

  test("refuses the s3 storage driver on the Cloudflare target", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, vars: { ...validConfig.vars, STORAGE_DRIVER: "s3" } },
      fetcher,
    );
    expect(findings.join(" ")).toContain("STORAGE_DRIVER=s3 is not supported on Cloudflare");
  });

  test("fails when a secret-class key sits in plaintext wrangler vars", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      { ...validConfig, vars: { ...validConfig.vars, SMTP_PASSWORD: "hunter2", S3_SECRET_ACCESS_KEY: "" } },
      fetcher,
    );
    const joined = findings.join(" ");
    expect(joined).toContain("SMTP_PASSWORD");
    expect(joined).not.toContain("S3_SECRET_ACCESS_KEY");
    expect(joined).not.toContain("hunter2");
  });

  test("accepts a matching Hyperdrive origin when query caching is disabled", async () => {
    const fetcher = async () => hyperdriveResponse();
    expect(await validateCloudflarePreflight(validEnvironment, validConfig, fetcher)).toEqual([]);
  });

  test("rejects Hyperdrive query caching", async () => {
    const fetcher = async () => hyperdriveResponse({ caching: { disabled: false } });
    const findings = await validateCloudflarePreflight(validEnvironment, validConfig, fetcher);
    expect(findings).toContain("Disable Hyperdrive query caching; cached session and permission reads can be stale.");
  });

  test("rejects a Hyperdrive origin that would migrate a different database", async () => {
    const fetcher = async () =>
      hyperdriveResponse({ origin: { host: "other.example.test", port: 5432, database: "erp", scheme: "postgres" } });
    const findings = await validateCloudflarePreflight(validEnvironment, validConfig, fetcher);
    expect(findings).toContain("Hyperdrive origin host, port, database and PostgreSQL scheme must match DATABASE_URL.");
  });

  test("does not echo API credentials when Cloudflare denies the configuration lookup", async () => {
    const fetcher = async () => new Response("forbidden", { status: 403 });
    const findings = await validateCloudflarePreflight(validEnvironment, validConfig, fetcher);
    expect(findings.join(" ")).toContain("Hyperdrive Read permission");
    expect(findings.join(" ")).not.toContain(validEnvironment.CLOUDFLARE_API_TOKEN);
  });
});
