import { useI18n } from "@loom/i18n/react";
import { cn } from "@web/lib/cn.ts";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Copies text to the clipboard and says so for a moment; a blocked clipboard simply does nothing. */
export function CopyButton({
  text,
  label,
  testId,
  className,
  showLabel = false,
}: {
  text: string;
  label: string;
  testId: string;
  className?: string;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied (insecure context, permissions); nothing useful to show.
    }
  };

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => void copy()}
      aria-label={copied ? t("assistant.copied") : label}
      title={copied ? t("assistant.copied") : label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
        className,
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {showLabel ? <span>{copied ? t("assistant.copied") : label}</span> : null}
      <span role="status" className="sr-only">
        {copied ? t("assistant.copied") : ""}
      </span>
    </button>
  );
}
