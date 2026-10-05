import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { NotificationFeed } from "../components/notification-feed.tsx";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../hooks/index.ts";

/** The full inbox, for a route the bell can link to. */
export function NotificationsScreen() {
  const { t } = useI18n();
  const list = useNotifications();
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <PageShell
        title={t("notifications.title")}
        description={t("notifications.description")}
        actions={
          (unread.data?.count ?? 0) > 0 ? (
            <Button variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {t("notifications.markAllRead")}
            </Button>
          ) : null
        }
      >
        <Card>
          {list.isPending ? (
            <PageLoading label={t("common.loading")} />
          ) : (
            <NotificationFeed items={list.data?.items ?? []} onOpen={(item) => markRead.mutate(item.id)} />
          )}
        </Card>
      </PageShell>
    </div>
  );
}
