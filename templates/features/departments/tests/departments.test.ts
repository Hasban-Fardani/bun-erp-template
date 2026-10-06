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
    // `extra` is outside the typed input; the variable sidesteps the excess-property check
    // because runtime rejection is exactly what is under test.
    const payload = { name: "A", code: "AA", extra: true };
    const res = await api.client.api.v1.departments.$post({ json: payload });
    expect(res.status).toBe(422);
  });

  test("missing id is 404 (not 403)", async () => {
    const res = await api.client.api.v1.departments[":id"].$get({
      param: { id: "0199aaaa-0000-7000-8000-000000000000" },
    });
    expect(res.status).toBe(404);
  });

  test("list returns the created rows with their fields", async () => {
    await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const res = await api.client.api.v1.departments.$get({ query: { perPage: "10" } });
    const body = (await res.json()) as { data: { items: { name: string; code: string }[]; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]).toMatchObject({ name: "A", code: "AA" });
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
      json: { name: "B", expectedVersion: 0 },
    });
    expect(patched.status).toBe(200);
    const missing = await api.client.api.v1.departments[":id"].$patch({
      param: { id: "0199aaaa-0000-7000-8000-000000000000" },
      json: { name: "B", expectedVersion: 0 },
    });
    expect(missing.status).toBe(404);
  });

  test("a stale expectedVersion is 409 with the current version", async () => {
    const created = await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const { data } = (await created.json()) as { data: { id: string; version: number } };
    expect(data.version).toBe(0);

    const updated = await api.client.api.v1.departments[":id"].$patch({
      param: { id: data.id },
      json: { name: "B", expectedVersion: data.version },
    });
    expect(updated.status).toBe(200);
    const fresh = (await updated.json()) as { data: { version: number } };
    expect(fresh.data.version).toBe(1);

    const stale = await api.client.api.v1.departments[":id"].$patch({
      param: { id: data.id },
      json: { name: "C", expectedVersion: data.version },
    });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as {
      error: { code: string; details?: { currentVersion?: number } };
    };
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.details?.currentVersion).toBe(1);

    // expectedVersion is part of the contract, not an optional hint; the typed client cannot
    // express a missing required field, so this one case uses app.request directly.
    const withoutVersion = await api.app.request(`/api/v1/departments/${data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: api.cookie },
      body: JSON.stringify({ name: "D" }),
    });
    expect(withoutVersion.status).toBe(422);
  });

  test("soft delete hides the row until includeDeleted, and restore returns it", async () => {
    const created = await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const { data } = (await created.json()) as { data: { id: string } };

    const removed = await api.client.api.v1.departments[":id"].$delete({ param: { id: data.id } });
    expect(removed.status).toBe(200);
    const removedBody = (await removed.json()) as { data: { deletedAt: string | null } };
    expect(removedBody.data.deletedAt).not.toBeNull();

    const gone = await api.client.api.v1.departments[":id"].$get({ param: { id: data.id } });
    expect(gone.status).toBe(404);

    const hidden = await api.client.api.v1.departments.$get({ query: { perPage: "10" } });
    expect(((await hidden.json()) as { data: { total: number } }).data.total).toBe(0);

    const shown = await api.client.api.v1.departments.$get({
      query: { perPage: "10", includeDeleted: "true" },
    });
    expect(((await shown.json()) as { data: { total: number } }).data.total).toBe(1);

    const restored = await api.client.api.v1.departments[":id"].restore.$post({ param: { id: data.id } });
    expect(restored.status).toBe(200);
    const restoredBody = (await restored.json()) as { data: { deletedAt: string | null } };
    expect(restoredBody.data.deletedAt).toBeNull();

    const back = await api.client.api.v1.departments[":id"].$get({ param: { id: data.id } });
    expect(back.status).toBe(200);
  });

  test("force delete removes a soft-deleted row permanently", async () => {
    const created = await api.client.api.v1.departments.$post({ json: { name: "A", code: "AA" } });
    const { data } = (await created.json()) as { data: { id: string } };
    await api.client.api.v1.departments[":id"].$delete({ param: { id: data.id } });

    const purged = await api.client.api.v1.departments[":id"].force.$delete({ param: { id: data.id } });
    expect(purged.status).toBe(200);

    const shown = await api.client.api.v1.departments.$get({
      query: { perPage: "10", includeDeleted: "true" },
    });
    expect(((await shown.json()) as { data: { total: number } }).data.total).toBe(0);

    const restoreGone = await api.client.api.v1.departments[":id"].restore.$post({ param: { id: data.id } });
    expect(restoreGone.status).toBe(404);
  });

  test("a malformed department id is 422, not 500", async () => {
    const malformed = "not-a-uuid";
    const get = await api.client.api.v1.departments[":id"].$get({ param: { id: malformed } });
    expect(get.status).toBe(422);
    const removed = await api.client.api.v1.departments[":id"].$delete({ param: { id: malformed } });
    expect(removed.status).toBe(422);
    const restore = await api.client.api.v1.departments[":id"].restore.$post({ param: { id: malformed } });
    expect(restore.status).toBe(422);
    const force = await api.client.api.v1.departments[":id"].force.$delete({ param: { id: malformed } });
    expect(force.status).toBe(422);
  });
});
