import { afterAll, beforeEach, expect, test } from "bun:test";
import { createSeededApp, type SeededApp } from "../../support/fixtures.ts";

let fixture: SeededApp;

beforeEach(async () => {
  fixture = await createSeededApp();
});

afterAll(async () => {
  await fixture?.close();
});

test("v1 health route is mounted at the declared API prefix", async () => {
  const response = await fixture.app.request("/api/v1/health", {
    headers: { "X-Request-Id": "version-contract-test" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Request-Id")).toBe("version-contract-test");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unversioned API paths are not aliases for v1", async () => {
  const response = await fixture.app.request("/api/health");
  expect(response.status).toBe(404);
});
