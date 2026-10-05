import { LocaleSwitcher } from "@bun-erp/i18n/react";
import { OfflineBanner } from "../features/offline/components/offline-banner.tsx";
import { OfflineDrafts } from "../features/offline/components/offline-drafts.tsx";

export function HomeScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex justify-end px-4 pt-3">
        <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
      </header>
      <OfflineBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <OfflineDrafts />
      </main>
    </div>
  );
}
