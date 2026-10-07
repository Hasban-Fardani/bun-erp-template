import { describe, expect, test } from "bun:test";
import { validateCloudflarePreflight } from "@cli/gates/cloudflare-preflight.ts";

const validEnvironment = {
  CLOUDFLARE_API_TOKEN: "test-token",
  CLOUDFLARE_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
  DATABASE_URL: "postgresql://user:secret@db.example.test:5432/erp",
  BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-for-preflight",
  CLOUDFLARE_APP_URL: "https://erp.example.workers.dev",
};

const validConfig = {
  hyperdrive: [{ id: "abcdef1234567890abcdef1234567890" }],
  limits: { cpu_ms: 10 },
  assets: { not_found_handling: "single-page-application", run_worker_first: ["/api", "/api/*"] },
  vars: {
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
  test("rejects Worker settings outside the Cloudflare Free budget", async () => {
    const fetcher = async () => hyperdriveResponse();
    const findings = await validateCloudflarePreflight(
      validEnvironment,
      {
        ...validConfig,
        limits: { cpu_ms: 30 },
        assets: { not_found_handling: "single-page-application", run_worker_first: ["/*"] },
      },
      fetcher,
    );
    expect(findings).toContain("Cloudflare Free requires limits.cpu_ms to be explicitly set between 1 and 10.");
    expect(findings).toContain(
      "Run the Worker only for /api and /api/* so frontend assets bypass Worker request quotas.",
    );
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
