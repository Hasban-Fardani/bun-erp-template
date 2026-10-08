/** The slice of `navigator` the shortcut hint reads; narrow so tests need no DOM. */
export interface PlatformSource {
  platform?: string;
  userAgentData?: { platform?: string };
}

/** True on macOS and iOS, where the command key is the primary modifier. */
export function isApplePlatform(source: PlatformSource | null = globalThis.navigator): boolean {
  const name = source?.userAgentData?.platform || source?.platform || "";
  return /mac|iphone|ipad|ipod/i.test(name);
}

/** The command-palette shortcut as shown to the person: Cmd+K on Apple devices, Ctrl+K elsewhere. */
export function commandShortcut(source: PlatformSource | null = globalThis.navigator): string {
  return isApplePlatform(source) ? "⌘K" : "Ctrl+K";
}
