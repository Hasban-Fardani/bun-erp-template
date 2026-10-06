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
  const response = await fixture.client.api.v1.health.$get(undefined, {
    headers: { "X-Request-Id": "version-contract-test" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Request-Id")).toBe("version-contract-test");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unversioned API paths are not aliases for v1", async () => {
  // `/api/health` is not a registered route, so the typed client has no path for it.
  const response = await fixture.app.request("/api/health");
  expect(response.status).toBe(404);
});
