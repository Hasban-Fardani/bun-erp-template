import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Small centred modal for short messages that need an answer — the recovery path on the login
 * screen, a confirmation with an explanation. The side `Sheet` is for forms and navigation;
 * this is for reading.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px] data-[slot=overlay]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-surface p-6 shadow-lg outline-none",
          )}
        >
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">{title}</Dialog.Title>
          <div className="mt-3 text-[13px] leading-relaxed text-ink-soft">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
