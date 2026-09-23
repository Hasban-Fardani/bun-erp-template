import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Toasts instead of inline alerts.
 *
 * An inline error sits in the layout and pushes content around; on a table page it also lands
 * far from the control that failed. A toast appears next to the work, states what happened,
 * and leaves on its own — and it does not reflow the page it interrupted.
 *
 * `role="status"` is used for success and `role="alert"` for failures, so a screen reader
 * announces a problem assertively but does not interrupt for a save that worked.
 */

type ToastTone = "success" | "error" | "info";

type Toast = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  success: "border-accent/30 bg-accent-soft text-accent",
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-border bg-surface text-ink",
};

const TONE_ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;

/** How long a toast stays. Errors linger: they ask the reader to do something. */
const TONE_MS: Record<ToastTone, number> = { success: 3500, error: 7000, info: 4000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => dismiss(id), TONE_MS[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "enter-soft pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg",
                TONE_STYLE[toast.tone],
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Tutup pemberitahuan"
                className="shrink-0 rounded p-0.5 opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API. Throws when used outside the provider so a missing provider is a loud
 * error during development rather than a silently swallowed message.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast dipakai di luar ToastProvider");
  return api;
}
