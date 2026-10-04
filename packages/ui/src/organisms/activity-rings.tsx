// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.

import * as React from "react";

import { cn } from "../lib/cn.ts";

export interface ActivityRing {
  label: string;
  /** Progress toward `max`. Values past `max` draw a full ring. */
  value: number;
  /** Goal for the ring. Defaults to 100. */
  max?: number;
  /** Any CSS color. Defaults to chart-1 through chart-5 in order. */
  color?: string;
}

export interface ActivityRingsProps extends Omit<React.ComponentProps<"fieldset">, "children"> {
  /** Outermost ring first. */
  rings: ActivityRing[];
  /** Diameter in pixels. */
  size?: number;
  /** Stroke width of each ring in pixels. */
  thickness?: number;
  /** Space between rings in pixels. */
  gap?: number;
  /** Opacity of the unfilled track, drawn in the ring's color. */
  trackOpacity?: number;
  /** Ring drawn at full strength while the rest dim. `null` shows every ring. */
  activeIndex?: number | null;
  onActiveIndexChange?: (index: number | null) => void;
  /** Content rendered in the middle. */
  children?: React.ReactNode;
}

const defaultColors = [
  "var(--color-accent)",
  "var(--color-ink-soft)",
  "var(--color-ink-muted)",
  "var(--color-danger)",
  "var(--color-border)",
];

// Round so server and client render identical attributes.
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Concentric progress rings, one per goal, in the style of a fitness watch. */
function ActivityRings({
  rings,
  size = 160,
  thickness = 12,
  gap = 4,
  trackOpacity = 0.2,
  activeIndex: activeProp,
  onActiveIndexChange,
  className,
  children,
  ...props
}: ActivityRingsProps) {
  const [activeState, setActiveState] = React.useState<number | null>(null);
  const active = activeProp === undefined ? activeState : activeProp;
  const setActive = (index: number | null) => {
    setActiveState(index);
    onActiveIndexChange?.(index);
  };

  const center = size / 2;
  const label = rings
    .map((ring) => {
      const max = ring.max ?? 100;
      return `${ring.label} ${Math.round((ring.value / (max || 1)) * 100)}%`;
    })
    .join(", ");

  return (
    <fieldset
      data-slot="activity-rings"
      className={cn("relative m-0 inline-flex shrink-0 border-0 p-0", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <legend className="sr-only">Activity rings: {label}</legend>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="presentation"
        className="absolute inset-0 -rotate-90"
      >
        <title>{label}</title>
        {rings.map((ring, index) => {
          const max = ring.max ?? 100;
          const fraction = Math.min(1, Math.max(0, ring.value / (max || 1)));
          const r = center - thickness / 2 - index * (thickness + gap);
          if (r <= 0) return null;
          const color = ring.color ?? defaultColors[index % defaultColors.length];
          const dimmed = active !== null && active !== index;
          return (
            <React.Fragment key={ring.label}>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG geometry needs its native circular hit target. */}
              <g
                data-ring=""
                data-active={active === index || undefined}
                role="button"
                tabIndex={0}
                aria-label={`${ring.label}, ${Math.round((ring.value / (max || 1)) * 100)}%`}
                aria-pressed={active === index}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActive(index);
                  }
                }}
                className="cursor-pointer transition-opacity duration-200 focus-visible:drop-shadow-[0_0_2px_var(--color-foreground)]"
                style={{ opacity: dimmed ? 0.35 : 1 }}
              >
                <circle
                  cx={center}
                  cy={center}
                  r={round(r)}
                  fill="none"
                  stroke={color}
                  strokeOpacity={trackOpacity}
                  strokeWidth={thickness}
                />
                {fraction > 0 ? (
                  <circle
                    cx={center}
                    cy={center}
                    r={round(r)}
                    fill="none"
                    stroke={color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    strokeDashoffset={round(1 - fraction)}
                    className="transition-[stroke-dashoffset] duration-700 ease-out"
                  />
                ) : null}
              </g>
            </React.Fragment>
          );
        })}
      </svg>
      {children ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </fieldset>
  );
}

export { ActivityRings };
