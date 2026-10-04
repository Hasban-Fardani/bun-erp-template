/** Stable cryptographic identifiers shared by Bun, Workers, browsers and Capacitor WebViews. */
export function createUuid(): string {
  return globalThis.crypto.randomUUID();
}
