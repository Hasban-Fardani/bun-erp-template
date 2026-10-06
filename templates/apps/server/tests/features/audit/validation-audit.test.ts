import { beforeEach, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;
beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
}, 30_000);

test("authorization precedes JSON parsing and malformed JSON has a 400 envelope", async () => {
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: "{" };
  expect((await api.app.request("/api/v1/roles", init)).status).toBe(401);
  const response = await api.app.request("/api/v1/roles", {
    ...init,
    headers: { ...init.headers, cookie: api.cookie },
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("BAD_REQUEST");
});

test("role create and update atomically record the actor, snapshots and trace", async () => {
  const created = await api.app.request("/api/v1/roles", api.json({ key: "first", name: "First" }));
  const body = await created.json();
  expect(created.status).toBe(200);
  const updated = await api.app.request(`/api/v1/roles/${body.data.id}`, api.json({ name: "Changed" }, "PATCH"));
  expect(updated.status).toBe(200);
  const events = await api.get<{
    items: {
      event: string;
      actorId: string;
      traceId: string;
      before: { name: string } | null;
      after: { name: string };
    }[];
  }>("/api/v1/audit-logs?subjectType=role&sort=createdAt&dir=asc");
  expect(events.data.items.map((entry) => entry.event)).toEqual(["role.created", "role.updated"]);
  expect(events.data.items[0]?.traceId).toBe(body.meta.requestId);
  expect(events.data.items[0]?.actorId).toBeTruthy();
  expect(events.data.items[1]?.before?.name).toBe("First");
  expect(events.data.items[1]?.after.name).toBe("Changed");
});

test("role replacement revokes previous access and invalid keys leave assignments intact", async () => {
  const created = await api.app.request(
    "/api/v1/users",
    api.json({ name: "Member", email: "member@example.test", password: "long-enough-password", roleKey: "owner" }),
  );
  const { data: user } = await created.json();
  const replaced = await api.app.request(`/api/v1/users/${user.id}/roles`, api.json({ roleKeys: ["staff"] }, "PUT"));
  expect(replaced.status).toBe(200);
  const { data } = await replaced.json();
  expect(data.roles.map((role: { key: string }) => role.key)).toEqual(["staff"]);
  expect(data.permissions).not.toContain("role.assign");
  const failed = await api.app.request(
    `/api/v1/users/${user.id}/roles`,
    api.json({ roleKeys: ["owner", "missing"] }, "PUT"),
  );
  expect(failed.status).toBe(404);
  const unchanged = await api.get<{ roles: { key: string }[] }>(`/api/v1/users/${user.id}`);
  expect(unchanged.data.roles.map((role) => role.key)).toEqual(["staff"]);
});
