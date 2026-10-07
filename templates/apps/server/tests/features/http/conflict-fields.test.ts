import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { assignRoleToFirstUser, createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

type ErrorBody = { error: { message: string; fields?: { path: string; message: string }[] } };

describe("409 conflict field paths", () => {
  test("a state conflict without a field path omits `fields`", async () => {
    const me = await api.client.api.v1.me.$get();
    const { data } = (await me.json()) as { data: { userId: string } };
    const res = await api.client.api.v1.users[":id"].$delete({ param: { id: data.userId } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.fields).toBeUndefined();
  });

  test("duplicate email points at the email field", async () => {
    const payload = { name: "A", email: "fields@test.dev", password: "sandi-yang-panjang" };
    const first = await api.client.api.v1.users.$post({ json: payload });
    expect(first.status).toBe(200);

    const second = await api.client.api.v1.users.$post({ json: payload });
    expect(second.status).toBe(409);
    const body = (await second.json()) as ErrorBody;
    expect(body.error.fields).toEqual([{ path: "email", message: "already in use" }]);
  });

  test("duplicate role key points at the key field; role in use omits it", async () => {
    const created = await api.client.api.v1.roles.$post({ json: { key: "dupe", name: "Dupe" } });
    const role = ((await created.json()) as { data: { id: string } }).data;

    const again = await api.client.api.v1.roles.$post({ json: { key: "dupe", name: "Dupe" } });
    expect(again.status).toBe(409);
    expect(((await again.json()) as ErrorBody).error.fields).toEqual([{ path: "key", message: "already in use" }]);

    await assignRoleToFirstUser(api, "dupe");

    const refused = await api.client.api.v1.roles[":id"].$delete({ param: { id: role.id } });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as ErrorBody).error.fields).toBeUndefined();
  });
});
