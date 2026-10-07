/**
 * Public surface of the identity feature. Other features import from here only — the
 * `feature-boundary` rule in `check:architecture` rejects deep imports. The `user` table is
 * public because RBAC and notifications hold foreign keys to it.
 */

export type { Actor } from "./policy.ts";
export { requireActor } from "./policy.ts";
export { users } from "./schema.ts";
