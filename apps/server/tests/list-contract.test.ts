import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "./helpers.ts";

let api: HttpFixture;
let { app } = {} as HttpFixture;
let cookie = "";

const json = (body: unknown, method = "POST"): RequestInit => api.json(body, method);

type ListBody<T> = {
  data: { items: T[]; page: number; perPage: number; total: number; totalPages: number };
};

type Named = { id: string; name: string; email: string };

const get = async <T>(path: string): Promise<ListBody<T>> => {
  const res = await app.request(path, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody<T>;
};

/** The owner created by `loginOwner` is already a row, so counts start at one. */
const seedUsers = async (...names: string[]) => {
  for (const name of names) {
    const res = await app.request(
      "/api/v1/users",
      json({ name, email: `${name.toLowerCase()}@example.test`, password: "sandi-panjang" }),
    );
    expect(res.status).toBe(200);
  }
};

beforeEach(async () => {
  api = await createHttpFixture();
  ({ app } = api);
  cookie = await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

describe("list contract", () => {
  test("pagination metadata is returned and slicing actually limits rows", async () => {
    await seedUsers("Candra", "Budi", "Ayu");

    const first = await get<Named>("/api/v1/users?page=1&perPage=2");
    expect(first.data.items).toHaveLength(2);
    expect(first.data).toMatchObject({ page: 1, perPage: 2, total: 4, totalPages: 2 });

    const second = await get<Named>("/api/v1/users?page=2&perPage=2");
    expect(second.data.items).toHaveLength(2);
    expect(second.data.page).toBe(2);

    // No overlap between pages — the whole point of the id tiebreaker in ORDER BY.
    const firstIds = first.data.items.map((u) => u.id);
    for (const row of second.data.items) expect(firstIds).not.toContain(row.id);
  });

  test("roles are paginated too, and report a stable total", async () => {
    const res = await app.request("/api/v1/roles?perPage=1", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody<{ key: string }>;
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    expect(body.data.perPage).toBe(1);
  });

  test("sort changes the order, and direction reverses it", async () => {
    await seedUsers("Candra", "Budi", "Ayu");

    // Admin belongs to the logged-in owner, so it is part of every expectation below.
    const asc = await get<Named>("/api/v1/users?sort=name&dir=asc");
    expect(asc.data.items.map((u) => u.name)).toEqual(["Admin", "Ayu", "Budi", "Candra"]);

    const desc = await get<Named>("/api/v1/users?sort=name&dir=desc");
    expect(desc.data.items.map((u) => u.name)).toEqual(["Candra", "Budi", "Ayu", "Admin"]);

    const byEmail = await get<Named>("/api/v1/users?sort=email&dir=asc");
    expect(byEmail.data.items.map((u) => u.email)).toEqual([
      "admin@example.test",
      "ayu@example.test",
      "budi@example.test",
      "candra@example.test",
    ]);
  });

  test("an unknown sort column is rejected, not silently ignored", async () => {
    const res = await app.request("/api/v1/users?sort=password", { headers: { cookie } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; fields: { path: string }[] } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fields.map((f) => f.path)).toContain("sort");
  });

  test("search filters rows and total reflects the filter, not the table", async () => {
    await seedUsers("Candra", "Budi", "Ayu");

    const found = await get<Named>("/api/v1/users?search=budi");
    expect(found.data.items).toHaveLength(1);
    expect(found.data.total).toBe(1);
    expect(found.data.totalPages).toBe(1);
  });

  test("an empty result still reports one page, so the UI never renders 'page 0 of 0'", async () => {
    const empty = await get<Named>("/api/v1/users?search=nomatchatall");
    expect(empty.data.items).toEqual([]);
    expect(empty.data.total).toBe(0);
    expect(empty.data.totalPages).toBe(1);
  });
});
