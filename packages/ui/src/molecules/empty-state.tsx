import type { LucideIcon } from "lucide-react";

export function EmptyState({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-ink-muted">
      {Icon ? <Icon size={20} aria-hidden="true" className="text-ink-muted" /> : null}
      {message}
    </div>
  );
}
