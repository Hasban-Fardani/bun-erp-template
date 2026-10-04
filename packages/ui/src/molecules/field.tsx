import type { ReactNode } from "react";

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
