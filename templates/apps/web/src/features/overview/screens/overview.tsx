import { useI18n } from "@loom/i18n/react";
import { Card } from "@loom/ui/atoms/card.tsx";
import { EmptyState } from "@loom/ui/molecules/empty-state.tsx";
import { PageLoading } from "@loom/ui/molecules/table-states.tsx";
import { PageShell } from "@loom/ui/templates/page-shell.tsx";
import { Link } from "@tanstack/react-router";
import { visibleNavGroups } from "@web/config/navigation.ts";
import { Compass } from "lucide-react";
import { useSession } from "../../identity/hooks/index.ts";

/**
 * The landing surface: what this account can actually open, in one place. It reads the same
 * permission-filtered navigation the sidebar and command palette use, so a new area appears here
 * automatically and nothing is invented. No metrics are fabricated — a template has no business
 * data, and a fake chart would be a lie about the deployment.
 */
export function OverviewScreen() {
  const { t } = useI18n();
  const session = useSession();

  if (session.isPending) return <PageLoading label={t("common.loading")} />;
  if (!session.data?.authenticated) return null;

  const items = visibleNavGroups(session.data.permissions).flatMap((group) => group.items);
  const name = session.data.user?.name ?? "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <PageShell title={t("overview.welcome", { name })} description={t("overview.subtitle")}>
        {items.length === 0 ? (
          <Card>
            <EmptyState icon={Compass} message={t("overview.noModules")} />
          </Card>
        ) : (
          <>
            <h2 className="text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
              {t("overview.modules")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Link
                  key={item.url}
                  to={item.url}
                  aria-label={t("overview.openNamed", { name: t(item.titleKey) })}
                  className="rounded-lg border border-border bg-surface p-4 outline-none transition-colors duration-150 ease-out hover:border-accent/40 hover:bg-background focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
                    <item.icon size={18} aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-[14px] font-semibold text-ink">{t(item.titleKey)}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </PageShell>
    </div>
  );
}
