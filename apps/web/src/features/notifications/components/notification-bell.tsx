import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { NotificationBell, NotificationsHeader } from "@bun-erp/ui/organisms/notification-bell.tsx";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../hooks/index.ts";
import { NotificationFeed } from "./notification-feed.tsx";

/** The header bell: unread count, a panel of the latest notifications, and mark-read actions. */
export function NotificationsBell() {
  const { t } = useI18n();
  const unread = useUnreadCount();
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unreadCount = unread.data?.count ?? 0;

  return (
    <NotificationBell unreadCount={unreadCount} label={t("notifications.title")}>
      <NotificationsHeader
        title={t("notifications.title")}
        action={
          unreadCount > 0 ? (
            <Button variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {t("notifications.markAllRead")}
            </Button>
          ) : null
        }
      />
      <NotificationFeed items={list.data?.items ?? []} onOpen={(item) => markRead.mutate(item.id)} />
    </NotificationBell>
  );
}
