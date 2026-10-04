import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)}>{children}</div>;
}
