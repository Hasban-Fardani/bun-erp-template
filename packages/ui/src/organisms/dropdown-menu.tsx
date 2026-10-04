import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export { Root } from "@radix-ui/react-dropdown-menu";

export function Trigger({ children, className }: { children: ReactNode; className?: string }) {
  return <DropdownMenu.Trigger className={className}>{children}</DropdownMenu.Trigger>;
}

export function Content({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className="z-50 min-w-44 rounded-md border border-border bg-surface p-1 text-[13px] shadow-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
        align="end"
        sideOffset={6}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function Item({
  children,
  onSelect,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-background focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function Separator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}
