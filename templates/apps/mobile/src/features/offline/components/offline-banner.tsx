import { useI18n } from "@loom/i18n/react";
import { useSyncExternalStore } from "react";
import { readOnlineStatus, subscribeOnlineStatus } from "../stores/online-status.ts";

/** Network state is advisory; cached local data remains the source of truth while offline. */
export function OfflineBanner() {
  const { t } = useI18n();
  const online = useSyncExternalStore(subscribeOnlineStatus, readOnlineStatus, () => true);

  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-soft-foreground"
    >
      {t("offline.offlineBanner")}
    </div>
  );
}
