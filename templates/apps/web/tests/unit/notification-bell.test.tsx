import { expect, test } from "bun:test";
import { I18nProvider } from "@loom/i18n/react";
import { NotificationBell, NotificationItem, NotificationList } from "@loom/ui/organisms/notification-bell.tsx";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationFeed } from "../../src/features/notifications/components/notification-feed.tsx";
import type { AppNotification } from "../../src/features/notifications/types/index.ts";

const at = new Date("2026-01-01T00:00:00Z");
const time = <time dateTime={at.toISOString()}>baru saja</time>;

test("the bell shows the unread count and an accessible label", () => {
  const html = renderToStaticMarkup(
    <NotificationBell unreadCount={3}>
      <p>Isi</p>
    </NotificationBell>,
  );
  expect(html).toContain("Notifications, 3 unread");
  expect(html).toContain(">3<");
});

test("a bell with no unread renders a plain label", () => {
  const html = renderToStaticMarkup(
    <NotificationBell unreadCount={0}>
      <p>Isi</p>
    </NotificationBell>,
  );
  expect(html).toContain('aria-label="Notifications"');
  expect(html).not.toContain("unread");
});

test("an unread item renders its title, body, and unread dot", () => {
  const html = renderToStaticMarkup(
    <NotificationList label="Inbox">
      <NotificationItem
        notification={{ id: "1", title: "Departemen dibuat", body: "Rincian baru", at, read: false }}
        time={time}
        onOpen={() => {}}
      />
    </NotificationList>,
  );
  expect(html).toContain("Departemen dibuat");
  expect(html).toContain("Rincian baru");
  expect(html).toContain("Unread");
  expect(html).toContain('aria-label="Inbox"');
});

test("a read item hides the unread dot and marks the row", () => {
  const html = renderToStaticMarkup(
    <NotificationList>
      <NotificationItem notification={{ id: "2", title: "Selesai", at, read: true }} time={time} onOpen={() => {}} />
    </NotificationList>,
  );
  expect(html).not.toContain("Unread");
  expect(html).toContain('data-read="true"');
});

test("the feed maps a notification row to a rendered item", () => {
  const item = {
    id: "1",
    type: "user.created",
    title: "Departemen dibuat",
    body: "Rincian",
    readAt: null,
    createdAt: at.toISOString(),
  } as unknown as AppNotification;
  const html = renderToStaticMarkup(
    <I18nProvider>
      <NotificationFeed items={[item]} onOpen={() => {}} />
    </I18nProvider>,
  );
  expect(html).toContain("Departemen dibuat");
  expect(html).toContain("Unread");
});

test("the feed shows the empty state with no items", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <NotificationFeed items={[]} onOpen={() => {}} />
    </I18nProvider>,
  );
  expect(html).toContain("No notifications yet.");
});

test("the unread dot uses a provided localized label instead of the English default", () => {
  const html = renderToStaticMarkup(
    <NotificationList>
      <NotificationItem
        notification={{ id: "3", title: "Baru", at, read: false }}
        time={time}
        onOpen={() => {}}
        unreadLabel="Belum dibaca"
      />
    </NotificationList>,
  );
  expect(html).toContain("Belum dibaca");
  expect(html).not.toContain(">Unread<");
});
