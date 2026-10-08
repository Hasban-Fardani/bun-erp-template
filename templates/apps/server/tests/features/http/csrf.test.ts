import { beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;
let cookie: string;

beforeEach(async () => {
  api = await createHttpFixture();
  cookie = await api.signInAsOwner();
});

/** Raw requests: the typed client cannot set a forged Origin or Sec-Fetch-Site header per call. */
function createRole(headers: Record<string, string>, key: string) {
  return api.app.request("/api/v1/roles", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, ...headers },
    body: JSON.stringify({ key, name: key }),
  });
}

describe("CSRF on the business API", () => {
  test("a cross-origin unsafe request is refused with 403 and does not run", async () => {
    const response = await createRole({ origin: "https://evil.example" }, "csrf-blocked");
    expect(response.status).toBe(403);
    const list = await api.client.api.v1.roles.$get({ query: {} });
    const keys = ((await list.json()) as { data: { items: { key: string }[] } }).data.items.map((r) => r.key);
    expect(keys).not.toContain("csrf-blocked");
  });

  test("the same unsafe methods are refused for PUT, PATCH and DELETE", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const response = await api.app.request("/api/v1/roles/00000000-0000-7000-8000-000000000000", {
        method,
        headers: { "content-type": "application/json", cookie, origin: "https://evil.example" },
        body: method === "DELETE" ? undefined : "{}",
      });
      expect(response.status).toBe(403);
    }
  });

  test("a same-origin request behaves normally", async () => {
    const response = await createRole({ origin: "http://localhost:3000" }, "csrf-same-origin");
    expect(response.status).toBe(200);
  });

  test("an Origin from AUTH_TRUSTED_ORIGINS is accepted", async () => {
    const { createApp } = await import("@/http/app.ts");
    const app = createApp({
      ...api.ctx,
      env: { ...api.ctx.env, trustedOrigins: ["https://web.example.test"] },
    });
    const response = await app.request("/api/v1/roles", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "https://web.example.test" },
      body: JSON.stringify({ key: "csrf-trusted", name: "csrf-trusted" }),
    });
    expect(response.status).toBe(200);
  });

  test("non-browser clients without Origin still work, browsers flagging cross-site do not", async () => {
    expect((await createRole({}, "csrf-no-origin")).status).toBe(200);
    expect((await createRole({ "sec-fetch-site": "cross-site" }, "csrf-fetch-metadata")).status).toBe(403);
    expect((await createRole({ "sec-fetch-site": "same-origin" }, "csrf-fetch-same")).status).toBe(200);
  });

  test("safe methods are never blocked by the Origin check", async () => {
    const response = await api.app.request("/api/v1/roles", { headers: { cookie, origin: "https://evil.example" } });
    expect(response.status).toBe(200);
  });
});
