import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/** Drawer samping berbasis Radix Dialog — dipakai sidebar mobile. */
export function Sheet({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-surface shadow-lg outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            className,
          )}
        >
          <Dialog.Title className="sr-only">Menu navigasi</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
