import { afterAll, beforeEach, expect, test } from "bun:test";
import { createSeededApp, type SeededApp } from "./helpers.ts";

let fixture: SeededApp;

beforeEach(async () => {
  fixture = await createSeededApp();
});

afterAll(async () => {
  await fixture?.close();
});

/**
 * CORS allowing a method the routes do NOT use = a failed preflight, and the symptom only
 * shows in a hybrid build (web and API on different origins). This test keeps the two in sync
 * so adding a new verb cannot silently break production.
 */
test("CORS mengizinkan setiap method yang benar-benar dipakai route", async () => {
  const app = fixture.app;
  const used = new Set(app.routes.map((r) => r.method.toUpperCase()).filter((m) => m !== "ALL"));
  // Trusted origin from the test env; any endpoint will do — only the preflight headers are under test.
  const res = await app.request("/api/v1/users", {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });
  const allowed = new Set(
    (res.headers.get("access-control-allow-methods") ?? "")
      .split(",")
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean),
  );
  const missing = [...used].filter((m) => !allowed.has(m));
  expect(missing).toEqual([]);
});

test("CORS menolak method di luar daftar", async () => {
  const app = fixture.app;
  const res = await app.request("/api/v1/users", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173", "access-control-request-method": "TRACE" },
  });
  expect(res.headers.get("access-control-allow-methods") ?? "").not.toContain("TRACE");
});
