import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { notifications } from "../../../features/notifications/schema.ts";
import { notify } from "../../../features/notifications/service.ts";
import { createMemoryMailDriver } from "../../../platform/mail/drivers/memory.ts";
import { createMailer } from "../../../platform/mail/mailer.ts";
import type { Logger } from "../../../platform/observability/logger.ts";
import { createHttpFixture, signUpUser } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

type NotificationRow = { id: string; title: string; readAt: string | null };

test("the database channel writes an inbox row that counts and marks read", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = (await api.get<{ userId: string }>("/api/v1/me")).data;

  await notify(api.ctx, {
    organizationId: api.organizationId,
    recipients: [me.userId],
    type: "department.created",
    title: "Departemen dibuat",
    body: "Departemen baru tersedia.",
  });

  const unread = (await api.get<{ count: number }>("/api/v1/notifications/unread-count")).data;
  expect(unread.count).toBe(1);

  const list = (await api.get<{ items: NotificationRow[] }>("/api/v1/notifications")).data;
  expect(list.items.map((row) => row.title)).toEqual(["Departemen dibuat"]);
  expect(list.items[0]?.readAt).toBeNull();

  const id = list.items[0]?.id as string;
  const marked = await api.app.request(`/api/v1/notifications/${id}/read`, {
    method: "POST",
    headers: { cookie: api.cookie },
  });
  expect(marked.status).toBe(200);

  expect((await api.get<{ count: number }>("/api/v1/notifications/unread-count")).data.count).toBe(0);
});

test("the mail channel sends through the configured mailer", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = (await api.get<{ userId: string }>("/api/v1/me")).data;
  const driver = createMemoryMailDriver();

  await notify(
    { ...api.ctx, mail: createMailer({ env: api.ctx.env, logger, driver }) },
    {
      organizationId: api.organizationId,
      recipients: [me.userId],
      type: "department.created",
      title: "Departemen dibuat",
      body: "Departemen baru tersedia.",
      via: ["mail"],
    },
  );

  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.subject).toBe("Departemen dibuat");
});

test("an unknown channel is rejected", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = (await api.get<{ userId: string }>("/api/v1/me")).data;
  await expect(
    notify(api.ctx, {
      organizationId: api.organizationId,
      recipients: [me.userId],
      type: "x",
      title: "x",
      via: ["sms" as "mail"],
    }),
  ).rejects.toThrow("Unknown notification channel");
});

test("the database channel writes one row per recipient", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = (await api.get<{ userId: string }>("/api/v1/me")).data;
  const other = await signUpUser(api.app, "other@example.test");

  await notify(api.ctx, {
    organizationId: api.organizationId,
    recipients: [me.userId, other.id],
    type: "department.created",
    title: "Departemen dibuat",
  });

  const rows = await api.ctx.db.select().from(notifications);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.userId))).toEqual(new Set([me.userId, other.id]));
});

test("read filter and mark-all-read follow the inbox contract", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = (await api.get<{ userId: string }>("/api/v1/me")).data;
  const base = { organizationId: api.organizationId, recipients: [me.userId], type: "x" } as const;

  await notify(api.ctx, { ...base, title: "Satu" });
  await notify(api.ctx, { ...base, title: "Dua" });

  const all = (await api.get<{ items: NotificationRow[] }>("/api/v1/notifications")).data;
  const unread = (await api.get<{ items: NotificationRow[] }>("/api/v1/notifications?read=false")).data;
  expect(all.items).toHaveLength(2);
  expect(unread.items).toHaveLength(2);

  const first = all.items[0]?.id as string;
  await api.app.request(`/api/v1/notifications/${first}/read`, { method: "POST", headers: { cookie: api.cookie } });

  expect((await api.get<{ items: NotificationRow[] }>("/api/v1/notifications?read=false")).data.items).toHaveLength(1);
  expect((await api.get<{ items: NotificationRow[] }>("/api/v1/notifications?read=true")).data.items).toHaveLength(1);

  const cleared = await api.app.request("/api/v1/notifications/read-all", {
    method: "POST",
    headers: { cookie: api.cookie },
  });
  const payload = (await cleared.json()) as { data: { updated: number } };
  expect(payload.data.updated).toBe(1);
  expect((await api.get<{ count: number }>("/api/v1/notifications/unread-count")).data.count).toBe(0);
});

test("a user cannot read or mark another user's notification", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const other = await signUpUser(api.app, "other@example.test");

  await notify(api.ctx, {
    organizationId: api.organizationId,
    recipients: [other.id],
    type: "department.created",
    title: "Untuk pengguna lain",
  });

  expect((await api.get<{ items: NotificationRow[] }>("/api/v1/notifications")).data.items).toEqual([]);

  const row = (await api.ctx.db.select().from(notifications).where(eq(notifications.userId, other.id)))[0];
  const response = await api.app.request(`/api/v1/notifications/${row?.id}/read`, {
    method: "POST",
    headers: { cookie: api.cookie },
  });
  expect(response.status).toBe(404);
});

test("the notifications API rejects an anonymous caller", async () => {
  const api = await createHttpFixture();
  const response = await api.app.request("/api/v1/notifications", { method: "GET" });
  expect(response.status).toBe(401);
});

test("the inbox accepts the list query the web client sends", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const response = await api.app.request("/api/v1/notifications?page=1&perPage=25&sort=createdAt&dir=asc", {
    headers: { cookie: api.cookie },
  });
  expect(response.status).toBe(200);
});
