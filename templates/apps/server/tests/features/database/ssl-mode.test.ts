import { describe, expect, test } from "bun:test";
import { createPostgresDatabase, resolvePostgresOptions } from "../../../database/postgres.ts";

const PLAIN = "postgresql://u:p@db.example:5432/app";

describe("DATABASE_SSL_MODE mapping", () => {
  test("disable maps to ssl:false, require to 'require', verify-full to rejectUnauthorized", () => {
    expect(resolvePostgresOptions(PLAIN, { sslMode: "disable" }).options.ssl).toBe(false);
    expect(resolvePostgresOptions(PLAIN, { sslMode: "require" }).options.ssl).toBe("require");
    expect(resolvePostgresOptions(PLAIN, { sslMode: "verify-full" }).options.ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  test("no mode (Hyperdrive) leaves TLS to the connection string", () => {
    const resolved = resolvePostgresOptions(PLAIN, {});
    expect("ssl" in resolved.options).toBe(false);
    expect(resolved.mismatch).toBeUndefined();
  });

  test("sslmode in the URL wins and the mismatch is reported", () => {
    const resolved = resolvePostgresOptions(`${PLAIN}?sslmode=disable`, { sslMode: "verify-full" });
    expect("ssl" in resolved.options).toBe(false);
    expect(resolved.mismatch).toContain("sslmode=disable");
    expect(resolved.mismatch).toContain("verify-full");
  });

  test("a URL sslmode that agrees with the configured mode is not a mismatch", () => {
    const resolved = resolvePostgresOptions(`${PLAIN}?sslmode=require`, { sslMode: "require" });
    expect(resolved.mismatch).toBeUndefined();
  });

  test("the mismatch is logged once per process", () => {
    const messages: unknown[] = [];
    const logger = { warn: (fields: Record<string, unknown>) => messages.push(fields) };
    const url = `${PLAIN}?sslmode=disable&application_name=once`;
    for (let i = 0; i < 3; i++) createPostgresDatabase(url, 1, true, { sslMode: "require", logger });
    expect(messages).toHaveLength(1);
  });

  test("a production verify-full config reaches the postgres.js client options", () => {
    const { db } = createPostgresDatabase(PLAIN, 1, true, { sslMode: "verify-full" });
    const client = (db as unknown as { $client: { options: { ssl: unknown } } }).$client;
    expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
  });
});
