/**
 * Network state is advisory; cached local data remains the source of truth while offline.
 * An unavailable connection report counts as online so the banner never lies about the device.
 */
export type OnlineEventTarget = {
  addEventListener?: (type: "online" | "offline", listener: () => void) => void;
  removeEventListener?: (type: "online" | "offline", listener: () => void) => void;
};

export function readOnlineStatus(): boolean {
  try {
    return globalThis.navigator?.onLine !== false;
  } catch {
    return true;
  }
}

export function subscribeOnlineStatus(
  onChange: () => void,
  target: OnlineEventTarget = globalThis as unknown as OnlineEventTarget,
): () => void {
  if (!target.addEventListener || !target.removeEventListener) return () => {};
  target.addEventListener("online", onChange);
  target.addEventListener("offline", onChange);
  return () => {
    target.removeEventListener?.("online", onChange);
    target.removeEventListener?.("offline", onChange);
  };
}
