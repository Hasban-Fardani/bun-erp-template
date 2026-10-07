import { expect, test } from "bun:test";
import { join } from "node:path";
import { parseQaCredentials } from "@cli/lib/qa-credentials.ts";
import { repoRoot } from "@cli/lib/repo.ts";

test("qa credentials are validated before any owner is created", () => {
  expect(() => parseQaCredentials(null)).toThrow(/JSON object/);
  expect(() => parseQaCredentials({})).toThrow(/email/);
  expect(() => parseQaCredentials({ email: "not-an-address", password: "long-enough-password" })).toThrow(/email/);
  expect(() => parseQaCredentials({ email: "admin@example.test" })).toThrow(/password/);
  expect(() => parseQaCredentials({ email: "admin@example.test", password: "short" })).toThrow(/password/);
  expect(parseQaCredentials({ email: "admin@example.test", password: "long-enough-password" })).toEqual({
    email: "admin@example.test",
    password: "long-enough-password",
  });
});

test("ci:owner never passes the owner password through process argv", async () => {
  const source = await Bun.file(join(repoRoot, "cli/tasks/ci-owner.ts")).text();
  expect(source).not.toMatch(/Bun\.spawn\([^)]*password/s);
});
