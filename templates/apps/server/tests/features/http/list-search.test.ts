import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

/**
 * The UI gives every table the same controls — search box, page size, sortable headers — so every
 * collection endpoint must accept the same query shape. `/roles` and `/audit-logs` once rejected
 * `search` with a 422 while the box was on screen, so every keystroke failed.
 *
 * Sort columns are per-endpoint by design (the allowlist is what stops ORDER BY injection), so
 * each entry names the column the UI actually sends as its default — the typed client keeps each
 * endpoint's allowlist in the query type.
 */
const COLLECTIONS = [
  {
    path: "/api/v1/users",
    list: () =>
      api.client.api.v1.users.$get({
        query: { page: "1", perPage: "5", sort: "name", dir: "desc", search: "a" },
      }),
  },
  {
    path: "/api/v1/roles",
    list: () =>
      api.client.api.v1.roles.$get({
        query: { page: "1", perPage: "5", sort: "key", dir: "desc", search: "a" },
      }),
  },
  {
    path: "/api/v1/audit-logs",
    list: () =>
      api.client.api.v1["audit-logs"].$get({
        query: { page: "1", perPage: "5", sort: "createdAt", dir: "desc", search: "a" },
      }),
  },
];

describe("UI and API agree on the list query contract", () => {
  test("the route table exposes every collection the UI renders", async () => {
    // Hono reports a mounted sub-app both as a mount point and as its own routes, so the
    // same path can appear twice; the set is what matters here.
    const registered = new Set(
      api.app.routes
        .filter((r) => r.method === "GET")
        .map((r) => r.path)
        .filter((p) => COLLECTIONS.some((c) => c.path === p)),
    );

    expect([...registered].sort()).toEqual(COLLECTIONS.map((c) => c.path).sort());
  });

  for (const { path, list } of COLLECTIONS) {
    test(`${path} accepts page, perPage, sort, dir and search`, async () => {
      const res = await list();

      if (res.status === 422) {
        const body = (await res.json()) as { error: { fields?: { message: string }[] } };
        throw new Error(`${path} rejected the UI's query shape: ${JSON.stringify(body.error.fields)}`);
      }
      expect(res.status).toBe(200);
    });
  }

  test("an unknown sort column is refused, so the allowlist is real", async () => {
    // `sort=password` is outside the typed allowlist, so only a raw request can send it.
    const res = await api.app.request("/api/v1/users?sort=password", { headers: { cookie: api.cookie } });
    expect(res.status).toBe(422);
  });

  test("search treats LIKE wildcards as literals, so % does not match every row", async () => {
    // A role create records one audit row, so a wildcard has a row it could wrongly match.
    await api.client.api.v1.roles.$post({ json: { key: "search-probe", name: "Search Probe" } });

    for (const wildcard of ["%", "_"]) {
      const res = await api.client.api.v1["audit-logs"].$get({ query: { search: wildcard } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { total: number } };
      expect(body.data.total).toBe(0);
    }
  });
});
