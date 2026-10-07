import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { Textarea } from "@bun-erp/ui/atoms/textarea.tsx";
import { useSoftAutoAnimate } from "@bun-erp/ui/lib/use-auto-animate.ts";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { useState } from "react";
import { useOfflineDrafts } from "../hooks/use-offline-drafts.ts";

/** A small reference screen for storing user-authored drafts without a network connection. */
export function OfflineDrafts() {
  const { t, formatDateTime } = useI18n();
  const [draftContentRef] = useSoftAutoAnimate<HTMLDivElement>();
  const [draftListRef] = useSoftAutoAnimate<HTMLUListElement>();
  const [text, setText] = useState("");
  const { drafts, loading, saving, readError, writeError, saveDraft, reload } = useOfflineDrafts();

  async function handleSave() {
    const saved = await saveDraft(text);
    if (saved) setText("");
  }

  return (
    <PageShell title={t("offline.title")} description={t("offline.description")}>
      <section className="space-y-4" aria-label={t("offline.storageLabel")}>
        <div className="space-y-2">
          <label htmlFor="offline-draft" className="text-sm font-medium text-ink">
            {t("offline.localNote")}
          </label>
          <Textarea
            id="offline-draft"
            rows={3}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            placeholder={t("offline.placeholder")}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">{t("offline.localOnly")}</p>
            <Button type="button" disabled={!text.trim() || saving} onClick={() => void handleSave()}>
              {saving ? t("offline.saving") : t("offline.save")}
            </Button>
          </div>
          {writeError ? (
            <p role="alert" className="text-sm text-danger">
              {t("offline.saveFailed")}
            </p>
          ) : null}
        </div>
        <div ref={draftContentRef} className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">{t("offline.savedHeading")}</h2>
          {loading ? (
            <div role="status" aria-live="polite" aria-label={t("offline.loadingSaved")}>
              <PageLoading label={t("offline.loading")} />
            </div>
          ) : readError ? (
            <div className="flex items-center justify-between gap-3" role="alert">
              <p className="text-sm text-danger">{t("offline.unavailable")}</p>
              <Button type="button" variant="ghost" onClick={() => void reload()}>
                {t("table.retry")}
              </Button>
            </div>
          ) : drafts.length === 0 ? (
            <Card>
              <EmptyState message={t("offline.empty")} />
            </Card>
          ) : (
            <ul ref={draftListRef} className="space-y-2">
              {drafts.map((draft) => (
                <li key={draft.key}>
                  <Card className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-ink">{draft.text}</p>
                    <time className="block text-xs text-ink-muted" dateTime={draft.updatedAt}>
                      {t("offline.savedAt", { timestamp: formatDateTime(draft.updatedAt) })}
                    </time>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageShell>
  );
}
