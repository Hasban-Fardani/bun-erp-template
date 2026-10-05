import { useI18n } from "@bun-erp/i18n/react";
import type { ActivityTone } from "@bun-erp/ui/molecules/activity-feed.tsx";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { type AppNotification, NotificationItem, NotificationList } from "@bun-erp/ui/organisms/notification-bell.tsx";
import { Bell, CircleCheck, CircleX, Info } from "lucide-react";
import type { Notification } from "../types/index.ts";

/** `domain.action_result` names map to an icon tone; unknown types fall back to neutral info. */
function notificationTone(type: string): ActivityTone {
  if (type.endsWith("deleted") || type.endsWith("failed")) return "danger";
  if (type.endsWith("created") || type.endsWith("completed")) return "success";
  return "info";
}

function notificationIcon(type: string) {
  if (type.endsWith("deleted") || type.endsWith("failed")) return <CircleX />;
  if (type.endsWith("created") || type.endsWith("completed")) return <CircleCheck />;
  if (type.endsWith("updated")) return <Info />;
  return <Bell />;
}

function toAppNotification(notification: Notification): AppNotification {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body || undefined,
    at: new Date(notification.createdAt),
    read: notification.readAt !== null,
    icon: notificationIcon(notification.type),
    tone: notificationTone(notification.type),
  };
}

/** The inbox list shared by the header bell and the full notifications screen. */
export function NotificationFeed({
  items,
  onOpen,
}: {
  items: Notification[];
  onOpen: (notification: AppNotification) => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  if (items.length === 0) return <EmptyState message={t("notifications.empty")} />;
  return (
    <NotificationList label={t("notifications.title")}>
      {items.map((item) => (
        <NotificationItem
          key={item.id}
          notification={toAppNotification(item)}
          time={
            <time dateTime={item.createdAt} className="text-[11.5px] text-ink-muted">
              {formatRelativeTime(item.createdAt)}
            </time>
          }
          onOpen={onOpen}
        />
      ))}
    </NotificationList>
  );
}
