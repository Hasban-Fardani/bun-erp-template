import { cn } from "../lib/cn.ts";

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] outline-none",
        "placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
      {...rest}
    />
  );
}
