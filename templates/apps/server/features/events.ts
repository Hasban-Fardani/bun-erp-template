import type { AnyEventListener } from "../infra/events/index.ts";

/**
 * Feature composition root for event listeners. A feature declares its listeners with
 * `defineListener` (next to the `defineEvent` it consumes) and adds them here, so platform code
 * never imports a domain. The default install declares none; `bun erp make:listener` appends.
 */
export function createEventListeners(): readonly AnyEventListener[] {
  return [];
}
