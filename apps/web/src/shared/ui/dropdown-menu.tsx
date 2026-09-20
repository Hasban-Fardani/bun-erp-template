import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

const content = "z-50 min-w-44 rounded-md border border-border bg-surface p-1 text-[13px] shadow-md outline-none";

export const UserMenu = {
  Root: DropdownMenu.Root,
  Trigger: ({ children, className }: { children: ReactNode; className?: string }) => (
    <DropdownMenu.Trigger className={className}>{children}</DropdownMenu.Trigger>
  ),
  Content: ({ children }: { children: ReactNode }) => (
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={content} align="end" sideOffset={6}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  ),
  Item: ({ children, onSelect, className }: { children: ReactNode; onSelect?: () => void; className?: string }) => (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-background",
        className,
      )}
    >
      {children}
    </DropdownMenu.Item>
  ),
  Separator: () => <DropdownMenu.Separator className="my-1 h-px bg-border" />,
};
