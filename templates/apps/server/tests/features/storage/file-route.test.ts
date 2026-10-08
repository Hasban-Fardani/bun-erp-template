import { expect, test } from "bun:test";
import { createObjectStorage } from "@bun-erp/storage/server";
import { createApp } from "@/http/app.ts";
import { createHttpFixture, createTestClient } from "../../support/fixtures.ts";

/** The fixture app, but over an isolated memory store so the test never touches `.data/storage`. */
async function createFileFixture() {
  const api = await createHttpFixture();
  const storage = createObjectStorage({ config: { driver: "memory" } });
  const app = createApp({ ...api.ctx, storage });
  const cookie = await api.signInAsOwner();
  return { storage, app, cookie, signedIn: createTestClient(app, cookie), anonymous: createTestClient(app) };
}

test("a signed-in user streams an object with its type, ETag and private caching", async () => {
  const { storage, signedIn } = await createFileFixture();
  await storage.put("reports/q1.csv", "a,b\n1,2\n");

  const response = await signedIn.api.v1.files[":key{.+}"].$get({ param: { key: "reports/q1.csv" } });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("a,b\n1,2\n");
  expect(response.headers.get("content-type")).toContain("text/csv");
  expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
  const etag = response.headers.get("etag");
  expect(etag).toMatch(/^"[0-9a-f]{32,}"$/);

  const revalidated = await signedIn.api.v1.files[":key{.+}"].$get(
    { param: { key: "reports/q1.csv" } },
    { headers: { "if-none-match": etag as string } },
  );
  expect(revalidated.status).toBe(304);
});

test("an anonymous request is 401, not 404", async () => {
  const { storage, anonymous } = await createFileFixture();
  await storage.put("reports/q1.csv", "x");
  const response = await anonymous.api.v1.files[":key{.+}"].$get({ param: { key: "reports/q1.csv" } });
  expect(response.status).toBe(401);
  const missing = await anonymous.api.v1.files[":key{.+}"].$get({ param: { key: "nope.txt" } });
  expect(missing.status).toBe(401);
});

test("a missing key is 404 for a signed-in user", async () => {
  const { signedIn } = await createFileFixture();
  const response = await signedIn.api.v1.files[":key{.+}"].$get({ param: { key: "nope/none.txt" } });
  expect(response.status).toBe(404);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe("NOT_FOUND");
});

test("path traversal is rejected with 400 before any driver call", async () => {
  const { storage, app, cookie } = await createFileFixture();
  await storage.put("secret.txt", "hidden");
  for (const key of ["..%2Fsecret.txt", "a%2F..%2F..%2Fsecret.txt", "a%5Cb.txt"]) {
    const response = await app.request(`/api/v1/files/${key}`, { headers: { cookie } });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
  }
});
