import * as z from "zod";

/**
 * Shared `:id` path parameter. A malformed uuid must fail validation (422) before it reaches
 * PostgreSQL, which would answer a malformed-uuid comparison with a 500.
 */
export const idParam = z.object({ id: z.uuid() });

/** `:id/roles/:roleKey` routes: the uuid id plus the role key segment. */
export const idRoleKeyParam = idParam.extend({ roleKey: z.string().min(1) });
