// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.
import type * as React from "react";

import { cn } from "../lib/cn.ts";

export interface CornerFrameProps extends React.ComponentProps<"div"> {
  /** Length of each registration mark, in pixels. */
  cornerSize?: number;
  /** Any CSS color used for the corner marks. */
  cornerColor?: string;
  /** Show a quiet hairline around the framed content. */
  bordered?: boolean;
}

/** A content frame with small registration marks at every corner. */
function CornerFrame({
  cornerSize = 10,
  cornerColor = "var(--color-ink-muted)",
  bordered = true,
  className,
  children,
  style,
  ...props
}: CornerFrameProps) {
  const cornerStyle: React.CSSProperties & { "--corner-size": string; "--corner-color": string } = {
    "--corner-size": `${cornerSize}px`,
    "--corner-color": cornerColor,
    ...style,
  };

  return (
    <div
      data-slot="corner-frame"
      className={cn("relative", bordered && "border", className)}
      style={cornerStyle}
      {...props}
    >
      {children}
      {(["top-left", "top-right", "bottom-right", "bottom-left"] as const).map((corner) => (
        <span
          key={corner}
          data-corner={corner}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-10 size-(--corner-size)",
            "before:absolute before:bg-(--corner-color) after:absolute after:bg-(--corner-color)",
            "before:top-1/2 before:h-px before:w-full before:-translate-y-1/2 after:left-1/2 after:h-full after:w-px after:-translate-x-1/2",
            corner === "top-left" && "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
            corner === "top-right" && "top-0 right-0 translate-x-1/2 -translate-y-1/2",
            corner === "bottom-right" && "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
            corner === "bottom-left" && "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
          )}
        />
      ))}
    </div>
  );
}

export { CornerFrame };
