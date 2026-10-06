import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { NotificationBell, NotificationsHeader } from "@bun-erp/ui/organisms/notification-bell.tsx";
import { Link } from "@tanstack/react-router";
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
      {list.isPending ? (
        <p role="status" className="px-4 py-8 text-center text-[12.5px] text-ink-muted">
          {t("common.loading")}
        </p>
      ) : list.isError ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-[12.5px] text-ink-muted">{t("table.empty.error.title")}</p>
          <Button variant="ghost" onClick={() => void list.refetch()}>
            {t("table.retry")}
          </Button>
        </div>
      ) : (
        <NotificationFeed items={list.data?.items ?? []} onOpen={(item) => markRead.mutate(item.id)} />
      )}
      <footer className="border-t border-border px-4 py-2 text-center">
        <Link
          to="/notifications"
          className="rounded-sm text-[12.5px] font-medium text-accent-soft-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("notifications.viewAll")}
        </Link>
      </footer>
    </NotificationBell>
  );
}
