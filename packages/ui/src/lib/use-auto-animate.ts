import type { AutoAnimateOptions, AutoAnimationPlugin } from "@formkit/auto-animate";
import { useAutoAnimate as useFormKitAutoAnimate } from "@formkit/auto-animate/react";

const SOFT_MOTION_OPTIONS: Partial<AutoAnimateOptions> = {
  duration: 180,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
};

type AccessibleAutoAnimateOptions = Omit<Partial<AutoAnimateOptions>, "disrespectUserMotionPreference">;

/**
 * Shared motion defaults for web and Capacitor. AutoAnimate handles reduced-motion preferences;
 * custom plugins remain available for cases that need a different keyframe effect.
 */
export function useSoftAutoAnimate<T extends Element>(
  preset: AccessibleAutoAnimateOptions | AutoAnimationPlugin = SOFT_MOTION_OPTIONS,
) {
  const config =
    typeof preset === "function"
      ? preset
      : { ...SOFT_MOTION_OPTIONS, ...preset, disrespectUserMotionPreference: false };

  return useFormKitAutoAnimate<T>(config);
}

export type { AutoAnimateOptions, AutoAnimationPlugin };
