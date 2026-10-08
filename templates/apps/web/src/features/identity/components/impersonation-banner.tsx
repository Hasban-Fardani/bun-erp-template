import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button-primitives";
import { Eye } from "lucide-react";
import { useSession, useStopImpersonation } from "../hooks/index.ts";

/** Presentational banner; split from the hook so it renders on its own in tests. */
export function ImpersonationBannerView({
  name,
  onStop,
  stopping,
}: {
  name: string;
  onStop: () => void;
  stopping?: boolean;
}) {
  const { t } = useI18n();
  return (
    // No close control on purpose: the only way out is Stop, so the operator cannot forget the state.
    <div
      role="status"
      data-testid="impersonation-banner"
      className="sticky top-0 z-40 flex w-full flex-wrap items-center justify-center gap-3 bg-inverse-surface px-4 py-2 text-[13px] font-medium text-inverse-foreground"
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span>{t("impersonation.viewingAs", { name })}</span>
      <Button data-testid="impersonation-stop" size="sm" variant="secondary" disabled={stopping} onClick={onStop}>
        {t("impersonation.stop")}
      </Button>
    </div>
  );
}

/** Rendered on every authenticated page; shows only while the session is an impersonation. */
export function ImpersonationBanner() {
  const session = useSession();
  const stop = useStopImpersonation();
  const impersonation = session.data?.impersonation;
  if (!impersonation) return null;
  return (
    <ImpersonationBannerView
      name={session.data?.user?.name ?? ""}
      stopping={stop.isPending}
      onStop={() => stop.mutate()}
    />
  );
}
