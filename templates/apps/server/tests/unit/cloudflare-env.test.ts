import { describe, expect, test } from "bun:test";
import { applyCloudflareVars, isSecretKey, parseEnvFile, splitCloudflareEnv } from "@cli/lib/cloudflare.ts";

describe("cloudflare env split", () => {
  test("secret-class keys are recognised, plain config is not", () => {
    for (const key of [
      "BETTER_AUTH_SECRET",
      "DATABASE_URL",
      "SMTP_PASSWORD",
      "S3_SECRET_ACCESS_KEY",
      "S3_ACCESS_KEY_ID",
    ]) {
      expect(isSecretKey(key)).toBe(true);
    }
    for (const key of ["APP_URL", "AUTH_TRUSTED_ORIGINS", "STORAGE_DRIVER", "SMTP_HOST", "SMTP_PORT"]) {
      expect(isSecretKey(key)).toBe(false);
    }
  });

  test("splits an env map into vars and a secret bulk map, dropping empties and unknown keys", () => {
    const { vars, secrets, skipped } = splitCloudflareEnv({
      APP_URL: "https://erp.example.test",
      STORAGE_DRIVER: "r2",
      BETTER_AUTH_SECRET: "s".repeat(32),
      DATABASE_URL: "postgresql://u:p@db/erp",
      SMTP_PASSWORD: "pw",
      S3_SECRET_ACCESS_KEY: "",
      PATH: "/usr/bin",
    });
    expect(vars).toEqual({ APP_URL: "https://erp.example.test", STORAGE_DRIVER: "r2" });
    expect(secrets).toEqual({ BETTER_AUTH_SECRET: "s".repeat(32), SMTP_PASSWORD: "pw" });
    // The Worker receives its connection string from the Hyperdrive binding, so it is never pushed.
    expect(skipped).toContain("DATABASE_URL");
    expect(JSON.stringify(vars)).not.toContain("pw");
  });

  test("applyCloudflareVars rewrites only the vars block and keeps comments", () => {
    const source = `{
  // keep me
  "name": "x",
  "vars": {
    "APP_URL": "https://old.example.test", // trailing
    "STORAGE_DRIVER": "r2"
  }
}
`;
    const next = applyCloudflareVars(source, { APP_URL: "https://new.example.test", STORAGE_DRIVER: "r2" });
    expect(next).toContain("// keep me");
    expect(next).toContain('"APP_URL": "https://new.example.test"');
    expect(next).not.toContain("old.example.test");
    expect(Bun.JSONC.parse(next)).toMatchObject({ vars: { APP_URL: "https://new.example.test" } });
  });

  test("parseEnvFile reads quoted values, comments and blank lines", () => {
    const parsed = parseEnvFile(
      ["# comment", "", "APP_URL=https://a.test", 'APP_NAME="Bun ERP"', "export STORAGE_DRIVER='r2'", "BAD LINE"].join(
        "\n",
      ),
    );
    expect(parsed).toEqual({ APP_URL: "https://a.test", APP_NAME: "Bun ERP", STORAGE_DRIVER: "r2" });
  });
});
