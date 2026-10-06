import { requireActor } from "../identity/policy.ts";

/**
 * Self-scoped module: every route reads or writes the signed-in actor's own rows, so the policy is
 * "authenticated" and no permission key applies. The guard lives here so the route never states its
 * authorization intent directly — a future permission gate changes this file only.
 */
export const authorizeActor = requireActor;
