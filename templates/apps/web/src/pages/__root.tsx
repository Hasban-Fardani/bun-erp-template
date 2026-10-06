import { LocaleSwitcher, useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, type ErrorComponentProps, Link, Outlet, useRouter } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  pendingComponent: LocalizedPageLoading,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

function LocalizedPageLoading() {
  const { t } = useI18n();
  return <PageLoading label={t("common.loading")} />;
}

function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex justify-end">
        <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
      </div>
      <PageShell title={t("route.error.title")}>
        <EmptyState message={t("route.error.detail")} />
        <Button onClick={() => void router.invalidate().then(reset)}>{t("route.error.retry")}</Button>
      </PageShell>
    </main>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-lg p-6">
      {/* slop-ok: error and not-found routes share the same locale switcher layout on purpose. */}
      <div className="mb-4 flex justify-end">
        <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
      </div>
      <PageShell title={t("route.notFound.title")}>
        <Link to="/" className="text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
          {t("route.notFound.home")}
        </Link>
      </PageShell>
    </main>
  );
}
