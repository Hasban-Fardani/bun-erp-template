import { cn } from "../lib/cn.ts";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none",
        "placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
      {...rest}
    />
  );
}
