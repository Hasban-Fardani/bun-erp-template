// Adapted from dashboardblocks `notifications` (MIT); see packages/ui/dashboard-sources.json.
import { Bell } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../lib/cn.ts";
import { ActivityIcon, type ActivityTone, UnreadDot } from "../molecules/activity-feed.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../molecules/popover.tsx";

export interface AppNotification {
  id: string;
  /** One sentence saying what happened. */
  title: ReactNode;
  /** A second line, such as a quote from a comment. */
  body?: string;
  at: Date;
  read: boolean;
  icon?: ReactNode;
  /** @default 'neutral' */
  tone?: ActivityTone;
}

export interface NotificationBellProps {
  children: ReactNode;
  className?: string;
  /** Accessible name for the trigger. */
  label?: string;
  unreadCount: number;
  /** Controls whether the panel is open. Leave out to let the bell manage it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function isLinkClick(event: MouseEvent) {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.target instanceof Element &&
    event.target.closest("a[href]") !== null
  );
}

/** A bell button with a count of unread notifications, opening a panel of them. */
export function NotificationBell({
  children,
  className,
  label = "Notifications",
  onOpenChange,
  open,
  unreadCount,
}: NotificationBellProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Popover open={open ?? uncontrolledOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread` : label}
          className={cn(
            "relative inline-flex size-8 items-center justify-center rounded-md text-ink-soft outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent",
            className,
          )}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground ring-surface absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-medium tabular-nums ring-2">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn("w-96 max-w-[calc(100vw-2rem)] gap-0 p-0", className)}
        onClick={(event) => {
          if (isLinkClick(event)) setOpen(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A title and an action, such as "Mark all as read", at the top of a list of notifications. */
export function NotificationsHeader({
  action,
  className,
  title = "Notifications",
}: {
  action?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 border-b border-border px-4 py-3", className)}>
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** The list of notifications. */
export function NotificationList({
  children,
  className,
  label = "Notifications",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn("flex max-h-96 flex-col overflow-y-auto", className)}>
      {children}
    </ul>
  );
}

export interface NotificationItemProps {
  /** Buttons under the text, such as Accept and Decline. */
  actions?: ReactNode;
  className?: string;
  notification: AppNotification;
  /** Runs when the notification is opened, such as to mark it read or navigate. */
  onOpen: (notification: AppNotification) => void;
  /** The formatted timestamp, so the component stays free of locale and clock. */
  time: ReactNode;
  /** Beside the time, such as a menu or a mark-as-read button. */
  trailing?: ReactNode;
  /** Accessible label for the unread dot; keep it localized. */
  unreadLabel?: string;
}

/** One notification. The whole row opens it; buttons in `actions` and `trailing` sit above that. */
export function NotificationItem({
  actions,
  className,
  notification,
  onOpen,
  time,
  trailing,
  unreadLabel,
}: NotificationItemProps) {
  return (
    <li
      data-read={notification.read || undefined}
      className={cn(
        "hover:bg-muted/60 focus-within:bg-muted/60 relative flex gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0",
        className,
      )}
    >
      <ActivityIcon icon={notification.icon ?? <Bell />} tone={notification.tone} className="ring-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] text-ink">
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className="rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden className="absolute inset-0" />
            {notification.title}
          </button>
        </p>
        {notification.body ? <p className="line-clamp-2 text-[12.5px] text-ink-muted">{notification.body}</p> : null}
        {time}
        {actions ? <div className="relative mt-1 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="relative flex shrink-0 flex-col items-end gap-2">
        {!notification.read && <UnreadDot className="mt-1.5" label={unreadLabel} />}
        {trailing}
      </div>
    </li>
  );
}
