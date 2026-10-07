import type { Translate } from "@bun-erp/i18n";
import { useI18n } from "@bun-erp/i18n/react";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { useEffect } from "react";
import { ApiError } from "./api.ts";

/**
 * The one message every failed mutation surfaces. Invalid credentials keep the sign-in specific
 * recovery copy; anything else gets the shared action-failed message.
 */
export function mutationErrorMessage(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code === "INVALID_EMAIL_OR_PASSWORD") return t("auth.signInFailed");
  return t("common.actionFailed");
}

type MutationErrorListener = (error: unknown) => void;

let listener: MutationErrorListener | null = null;

/** Query-client callbacks live outside React; the component below owns the bridge. */
export function setMutationErrorListener(next: MutationErrorListener | null): void {
  listener = next;
}

export function reportMutationError(error: unknown): void {
  listener?.(error);
}

/** Mounted once inside the toast provider; it turns every failed mutation into a toast. */
export function MutationErrorToaster() {
  const { t } = useI18n();
  const toast = useToast();

  useEffect(() => {
    setMutationErrorListener((error) => toast.error(mutationErrorMessage(t, error)));
    return () => setMutationErrorListener(null);
  }, [t, toast]);

  return null;
}
