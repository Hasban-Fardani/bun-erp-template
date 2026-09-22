import { Check, type LucideIcon, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../lib/cn.ts";

/** Base surface card; colors & borders come from theme tokens, not raw values. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)}>{children}</div>;
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

/**
 * Actions always render as labeled icons, never plain text: action-heavy table rows
 * stay scannable, and `aria-label` is required so the icon keeps a name.
 */
export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  className,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  variant?: "ghost" | "danger" | "primary";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors sm:size-8",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "text-ink-soft hover:bg-background hover:text-ink",
        variant === "danger" && "text-ink-soft hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...rest}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

export function Button({
  variant = "primary",
  icon: Icon,
  className,
  children,
  ...rest
}: {
  variant?: "primary" | "ghost" | "danger";
  icon?: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "text-ink-soft hover:bg-background",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : null}
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

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] outline-none",
        "placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...rest}
    />
  );
}

/** Label is always bound to `htmlFor`; an unlabeled input reads as blank to a screen reader. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11.5px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-ink-muted">
      {Icon ? <Icon size={20} aria-hidden="true" className="text-ink-muted" /> : null}
      {message}
    </div>
  );
}

/**
 * Delete needs confirmation, but `window.confirm` blocks and cannot be styled. This button
 * turns into an inline question: the first click opens the options, cancel stays within reach.
 */
export function ConfirmDelete({
  label,
  onConfirm,
  disabled,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <IconButton
        icon={Trash2}
        label={`Hapus ${label}`}
        variant="danger"
        disabled={disabled}
        onClick={() => setArmed(true)}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton icon={Check} label={`Konfirmasi hapus ${label}`} variant="danger" onClick={onConfirm} />
      <IconButton icon={X} label="Batal" onClick={() => setArmed(false)} />
    </span>
  );
}
