import { useI18n } from "@loom/i18n/react";
import { Button } from "@loom/ui/atoms/button.tsx";
import { Card } from "@loom/ui/atoms/card.tsx";
import { PageLoading, TableEmpty } from "@loom/ui/molecules/table-states.tsx";
import { PageShell } from "@loom/ui/templates/page-shell.tsx";
import { Loader2 } from "lucide-react";
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
  // The default app has no shared table package; the inbox only needs the empty-state labels.
  const labels = {
    empty: {
      "no-data": { title: t("notifications.empty.noData.title"), detail: t("notifications.empty.noData.detail") },
      "no-match": { title: t("notifications.empty.noMatch.title"), detail: t("notifications.empty.noMatch.detail") },
      error: { title: t("notifications.error.title"), detail: t("notifications.error.detail") },
    },
    retry: t("notifications.retry"),
  };
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
            <PageLoading label={t("notifications.loading")} />
          ) : list.isError ? (
            <TableEmpty
              cause="error"
              labels={labels.empty}
              action={
                <Button variant="ghost" onClick={() => void list.refetch()}>
                  {labels.retry}
                </Button>
              }
            />
          ) : (
            <>
              {list.isFetching ? (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="table-refreshing"
                  className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-[12px] text-ink-muted"
                >
                  <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" />
                  {t("notifications.refreshing")}
                </div>
              ) : null}
              <NotificationFeed items={list.data?.items ?? []} onOpen={(item) => markRead.mutate(item.id)} />
            </>
          )}
        </Card>
      </PageShell>
    </div>
  );
}
