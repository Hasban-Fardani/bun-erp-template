import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Side drawer built on Radix Dialog. `side="left"` for mobile navigation,
 * `side="right"` for forms — both are one surface, so the locked-focus behavior
 * (trap, Esc, outside click) is written only once.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  side = "left",
  children,
  className,
  titleHidden = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side?: "left" | "right";
  children: ReactNode;
  className?: string;
  /** Hide the title bar when the content carries its own header; the name stays readable to a screen reader. */
  titleHidden?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="overlay" className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          data-slot="panel"
          data-side={side}
          className={cn(
            "fixed inset-y-0 z-50 flex w-full max-w-sm flex-col border-border bg-surface shadow-lg outline-none",
            side === "left" ? "left-0 w-64 border-r" : "right-0 border-l",
            className,
          )}
        >
          <Dialog.Title
            className={cn("border-b border-border/70 px-5 py-3 text-[15px] font-semibold", titleHidden && "sr-only")}
          >
            {title}
          </Dialog.Title>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
