import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
