import { useI18n } from "@bun-erp/i18n/react";
import { useEffect, useState } from "react";

/** Network state is advisory; cached local data remains the source of truth while offline. */
export function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

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
