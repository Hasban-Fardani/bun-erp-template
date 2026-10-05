import { expect, test } from "bun:test";
import { notify } from "../../../features/notifications/service.ts";
import { createMemoryMailDriver } from "../../../platform/mail/drivers/memory.ts";
import { createMailer } from "../../../platform/mail/mailer.ts";
import type { Logger } from "../../../platform/observability/logger.ts";
import { createHttpFixture } from "../../support/fixtures.ts";

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
