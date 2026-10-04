import { LocaleSwitcher } from "@bun-erp/i18n/react";
import { OfflineBanner } from "../features/offline/components/offline-banner.tsx";
import { OfflineDrafts } from "../features/offline/components/offline-drafts.tsx";

export function HomeScreen() {
  return (
    <>
      <div className="flex justify-end px-4 py-3">
        <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
      </div>
      <OfflineBanner />
      <OfflineDrafts />
    </>
  );
}
