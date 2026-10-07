import { createUuid } from "@bun-erp/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMobileLogger } from "../../../lib/logger.ts";
import { getOfflineStore } from "../stores/offline-store.ts";

export type OfflineDraft = { key: string; text: string; updatedAt: string };

type Draft = { text: string };

const logger = createMobileLogger("offline-drafts");

/** Owns the local drafts lifecycle; read and write failures stay separate so each gets its own recovery. */
export function useOfflineDrafts() {
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const store = await getOfflineStore();
      const records = await store.list<Draft>("drafts");
      if (!active.current) return;
      setDrafts(records.map((record) => ({ key: record.key, text: record.value.text, updatedAt: record.updatedAt })));
      setReadError(false);
    } catch {
      logger.error("offline.storage.read_failed");
      if (active.current) setReadError(true);
    } finally {
      if (active.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);

  const saveDraft = useCallback(async (value: string): Promise<boolean> => {
    const text = value.trim();
    if (!text) return false;
    setSaving(true);
    setWriteError(false);
    try {
      const store = await getOfflineStore();
      const saved = await store.put("drafts", createUuid(), { text });
      if (active.current) {
        setDrafts((current) => [{ key: saved.key, text, updatedAt: saved.updatedAt }, ...current]);
      }
      return true;
    } catch {
      logger.error("offline.storage.write_failed");
      if (active.current) setWriteError(true);
      return false;
    } finally {
      if (active.current) setSaving(false);
    }
  }, []);

  return { drafts, loading, saving, readError, writeError, saveDraft, reload: load };
}
