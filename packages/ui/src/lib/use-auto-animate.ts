import type { AutoAnimateOptions, AutoAnimationPlugin } from "@formkit/auto-animate";
import { useAutoAnimate as useFormKitAutoAnimate } from "@formkit/auto-animate/react";

/**
 * Shared list motion. 200 ms on the panel enter curve matches the `--motion-*` scale in
 * `styles.css` closely enough that a reordered list and an opening menu feel like one system,
 * and it is slow enough to read what moved without holding the user back. AutoAnimate honours
 * reduced-motion preferences by default; `disrespectUserMotionPreference` stays false so a
 * caller cannot override that.
 */
const SOFT_MOTION_OPTIONS: Partial<AutoAnimateOptions> = {
  duration: 200,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
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
