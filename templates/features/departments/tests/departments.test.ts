import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

// Cold WASM startup belongs to the fixture budget, not Bun's 5-second hook default.
beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
}, 30_000);

afterAll(async () => {
  await api?.close();
});

describe("departments", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    // The fixture is signed in, so an explicit cookie-less client proves the anonymous case.
    const res = await createTestClient(api.app).api.v1.departments.$get({ query: {} });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("create returns envelope with requestId and uuidv7 id", async () => {
    const res = await api.client.api.v1.departments.$post({ json: { name: "Keuangan", code: "KEU" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; code: string }; meta: { requestId: string } };
    expect(body.data.code).toBe("KEU");
    expect(body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // uuidv7: the first byte is time-based
    expect(body.data.id[14]).toBe("7");
    expect(res.headers.get("x-request-id")).toBe(body.meta.requestId);
  });

  test("duplicate code is 409 conflict, not 422", async () => {
    await api.client.api.v1.departments.$post({ json: { name: "A", code: "AAA" } });
    const res = await api.client.api.v1.departments.$post({ json: { name: "B", code: "AAA" } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  test("invalid payload is 422 with field paths", async () => {
    const res = await api.client.api.v1.departments.$post({ json: { name: "", code: "lower" } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { fields: { path: string }[] } };
    expect(body.error.fields.map((f) => f.path).sort()).toEqual(["code", "name"]);
  });

  test("unknown key is rejected (strictObject)", async () => {
    // `organizationId` is outside the typed input; the variable sidesteps the excess-property check
    // because runtime rejection is exactly what is under test.
    const payload = { name: "A", code: "AA", organizationId: "spoof" };
    const res = await api.client.api.v1.departments.$post({ json: payload });
    expect(res.status).toBe(422);
  });

  test("missing id is 404 (not 403)", async () => {
    const res = await api.client.api.v1.departments[":id"].$get({
      param: { id: "0199aaaa-0000-7000-8000-000000000000" },
    });
    expect(res.status).toBe(404);
  });

  test("list is scoped to organization", async () => {
    await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const res = await api.client.api.v1.departments.$get({ query: { perPage: "10" } });
    const body = (await res.json()) as { data: { items: { organizationId: string }[]; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.organizationId).toBe(api.organizationId);
  });

  test("unknown route returns NOT_FOUND envelope", async () => {
    // `/api/v1/nope` is not a registered route, so the typed client has no path for it.
    const res = await api.app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("patch updates and returns 404 when absent", async () => {
    const created = await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const { data } = (await created.json()) as { data: { id: string } };
    const patched = await api.client.api.v1.departments[":id"].$patch({
      param: { id: data.id },
      json: { name: "B" },
    });
    expect(patched.status).toBe(200);
    const missing = await api.client.api.v1.departments[":id"].$patch({
      param: { id: "0199aaaa-0000-7000-8000-000000000000" },
      json: { name: "B" },
    });
    expect(missing.status).toBe(404);
  });
});
