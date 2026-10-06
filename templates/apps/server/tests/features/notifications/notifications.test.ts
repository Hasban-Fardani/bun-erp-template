import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { notifications } from "../../../features/notifications/schema.ts";
import { notify } from "../../../features/notifications/service.ts";
import { createFixtureUser, createHttpFixture, dataOf } from "../../support/fixtures.ts";

type NotificationRow = { id: string; title: string; readAt: string | null };

test("the database channel writes an inbox row that counts and marks read", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());

  await notify(api.ctx, {
    recipients: [me.userId],
    type: "user.created",
    title: "Akun dibuat",
    body: "Akun baru tersedia.",
  });

  const unread = await dataOf<{ count: number }>(api.client.api.v1.notifications["unread-count"].$get());
  expect(unread.count).toBe(1);

  const list = await dataOf<{ items: NotificationRow[] }>(api.client.api.v1.notifications.$get({ query: {} }));
  expect(list.items.map((row) => row.title)).toEqual(["Akun dibuat"]);
  expect(list.items[0]?.readAt).toBeNull();

  const id = list.items[0]?.id as string;
  const marked = await api.client.api.v1.notifications[":id"].read.$post({ param: { id } });
  expect(marked.status).toBe(200);

  expect((await dataOf<{ count: number }>(api.client.api.v1.notifications["unread-count"].$get())).count).toBe(0);
});

test("an unknown channel is rejected", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  await expect(
    notify(api.ctx, {
      recipients: [me.userId],
      type: "x",
      title: "x",
      via: ["sms" as "database"],
    }),
  ).rejects.toThrow("Unknown notification channel");
});

test("the database channel writes one row per recipient", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const other = await createFixtureUser(api.ctx.db, "other@example.test");

  await notify(api.ctx, {
    recipients: [me.userId, other.id],
    type: "user.created",
    title: "Akun dibuat",
  });

  const rows = await api.ctx.db.select().from(notifications);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.userId))).toEqual(new Set([me.userId, other.id]));
});

test("read filter and mark-all-read follow the inbox contract", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const base = { recipients: [me.userId], type: "x" } as const;

  await notify(api.ctx, { ...base, title: "Satu" });
  await notify(api.ctx, { ...base, title: "Dua" });

  const all = await dataOf<{ items: NotificationRow[] }>(api.client.api.v1.notifications.$get({ query: {} }));
  const unread = await dataOf<{ items: NotificationRow[] }>(
    api.client.api.v1.notifications.$get({ query: { read: "false" } }),
  );
  expect(all.items).toHaveLength(2);
  expect(unread.items).toHaveLength(2);

  const first = all.items[0]?.id as string;
  await api.client.api.v1.notifications[":id"].read.$post({ param: { id: first } });

  expect(
    (await dataOf<{ items: NotificationRow[] }>(api.client.api.v1.notifications.$get({ query: { read: "false" } })))
      .items,
  ).toHaveLength(1);
  expect(
    (await dataOf<{ items: NotificationRow[] }>(api.client.api.v1.notifications.$get({ query: { read: "true" } })))
      .items,
  ).toHaveLength(1);

  const cleared = await api.client.api.v1.notifications["read-all"].$post();
  const payload = (await cleared.json()) as { data: { updated: number } };
  expect(payload.data.updated).toBe(1);
  expect((await dataOf<{ count: number }>(api.client.api.v1.notifications["unread-count"].$get())).count).toBe(0);
});

test("a user cannot read or mark another user's notification", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const other = await createFixtureUser(api.ctx.db, "other@example.test");

  await notify(api.ctx, {
    recipients: [other.id],
    type: "user.created",
    title: "Untuk pengguna lain",
  });

  expect(
    (await dataOf<{ items: NotificationRow[] }>(api.client.api.v1.notifications.$get({ query: {} }))).items,
  ).toEqual([]);

  const row = (await api.ctx.db.select().from(notifications).where(eq(notifications.userId, other.id)))[0];
  const response = await api.client.api.v1.notifications[":id"].read.$post({ param: { id: row?.id as string } });
  expect(response.status).toBe(404);
});

test("the notifications API rejects an anonymous caller", async () => {
  const api = await createHttpFixture();
  const response = await api.client.api.v1.notifications.$get({ query: {} });
  expect(response.status).toBe(401);
});

test("the inbox accepts the list query the web client sends", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const response = await api.client.api.v1.notifications.$get({
    query: { page: "1", perPage: "25", sort: "createdAt", dir: "asc" },
  });
  expect(response.status).toBe(200);
});

test("a malformed notification id is 422, not 500", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const response = await api.client.api.v1.notifications[":id"].read.$post({ param: { id: "not-a-uuid" } });
  expect(response.status).toBe(422);
});
