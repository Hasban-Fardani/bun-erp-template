import { cn } from "@bun-erp/ui/lib/cn.ts";
import { lazy, Suspense } from "react";
import type { SparklineProps } from "./sparkline-renderer.tsx";

const Renderer = lazy(() => import("./sparkline-renderer.tsx").then((module) => ({ default: module.Sparkline })));

export type { SparklineProps } from "./sparkline-renderer.tsx";
export function Sparkline(props: SparklineProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading chart"
          className={cn("h-10 w-full rounded bg-border motion-safe:animate-pulse", props.className)}
        >
          <span className="sr-only">Loading chart</span>
        </div>
      }
    >
      <Renderer {...props} />
    </Suspense>
  );
}
