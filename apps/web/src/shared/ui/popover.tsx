import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Popover, adapted from shadcn/ui's `popover`. Upstream hardcodes a portal to `document.body`.
 *
 * That breaks inside a Sheet or Dialog: radix's FocusScope installs guards and pulls focus back
 * to the scope, so a portalled popover opens but never receives a keystroke. Rendering inside
 * the scope is what makes a Combobox usable in a form.
 */
export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Content
      data-slot="popover-content"
      align={align}
      sideOffset={sideOffset}
      onOpenAutoFocus={(event) => {
        // Focus belongs to the content (a Combobox input), never to the first focusable element.
        event.preventDefault();
        props.onOpenAutoFocus?.(event);
      }}
      className={cn(
        "z-50 w-72 rounded-lg border border-border bg-surface p-0 text-[13px] shadow-lg outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        className,
      )}
      {...props}
    />
  );
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}
