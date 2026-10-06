import { beforeEach, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;
beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
}, 30_000);

test("authorization precedes JSON parsing and malformed JSON has a 400 envelope", async () => {
  // Malformed JSON: the typed client always serializes `json`, so only a raw request can send `{`.
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: "{" };
  expect((await api.app.request("/api/v1/roles", init)).status).toBe(401);
  // Same raw body; the cookie only exists to get past authorization and reach the parser.
  const response = await api.app.request("/api/v1/roles", {
    ...init,
    headers: { ...init.headers, cookie: api.cookie },
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("BAD_REQUEST");
});

test("role create and update atomically record the actor, snapshots and trace", async () => {
  const created = await api.client.api.v1.roles.$post({ json: { key: "first", name: "First" } });
  const body = (await created.json()) as { data: { id: string }; meta: { requestId: string } };
  expect(created.status).toBe(200);
  const updated = await api.client.api.v1.roles[":id"].$patch({
    param: { id: body.data.id },
    json: { name: "Changed" },
  });
  expect(updated.status).toBe(200);
  const events = (await (
    await api.client.api.v1["audit-logs"].$get({
      query: { subjectType: "role", sort: "createdAt", dir: "asc" },
    })
  ).json()) as {
    data: {
      items: {
        event: string;
        actorId: string | null;
        traceId: string;
        before: unknown;
        after: unknown;
      }[];
    };
  };
  expect(events.data.items.map((entry) => entry.event)).toEqual(["role.created", "role.updated"]);
  expect(events.data.items[0]?.traceId).toBe(body.meta.requestId);
  expect(events.data.items[0]?.actorId).toBeTruthy();
  expect(events.data.items[1]?.before).toMatchObject({ name: "First" });
  expect(events.data.items[1]?.after).toMatchObject({ name: "Changed" });
});

test("role replacement revokes previous access and invalid keys leave assignments intact", async () => {
  const created = await api.client.api.v1.users.$post({
    json: { name: "Member", email: "member@example.test", password: "long-enough-password", roleKey: "owner" },
  });
  const { data: user } = (await created.json()) as { data: { id: string } };
  const replaced = await api.client.api.v1.users[":id"].roles.$put({
    param: { id: user.id },
    json: { roleKeys: ["staff"] },
  });
  expect(replaced.status).toBe(200);
  const { data } = (await replaced.json()) as { data: { roles: { key: string }[]; permissions: string[] } };
  expect(data.roles.map((role: { key: string }) => role.key)).toEqual(["staff"]);
  expect(data.permissions).not.toContain("role.assign");
  const failed = await api.client.api.v1.users[":id"].roles.$put({
    param: { id: user.id },
    json: { roleKeys: ["owner", "missing"] },
  });
  expect(failed.status).toBe(404);
  const unchanged = (await (await api.client.api.v1.users[":id"].$get({ param: { id: user.id } })).json()) as {
    data: { roles: { key: string }[] };
  };
  expect(unchanged.data.roles.map((role) => role.key)).toEqual(["staff"]);
});
