import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "../../../lib/rpc.ts";
import { notificationKeys, notificationsQuery, unreadCountQuery } from "../api/queries.ts";

export function useNotifications(query = "") {
  return useQuery(notificationsQuery(query));
}

export function useUnreadCount() {
  return useQuery(unreadCountQuery);
}

/** Both mutations invalidate the whole `notifications` prefix, so the bell and the list stay in sync. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(rpc.notifications[":id"].read.$post({ param: { id } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(rpc.notifications["read-all"].$post()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
