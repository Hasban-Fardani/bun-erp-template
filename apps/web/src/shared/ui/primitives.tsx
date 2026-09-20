import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/** Kartu permukaan dasar; warna & garis dari token tema, bukan nilai mentah. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border/70">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-background text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: { variant?: "primary" | "ghost" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        variant === "primary" ? "bg-ink text-white hover:bg-ink/85" : "text-ink-soft hover:bg-background",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none",
        "placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...rest}
    />
  );
}

/** Empty/error state tunggal supaya setiap tabel punya cara bicara yang sama. */
export function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-10 text-center text-[13px] text-ink-muted">{message}</div>;
}
