import { organization } from "better-auth/plugins";

/**
 * The Better Auth organization plugin: organizations, members, invitations and the active
 * organization on the session. The `auth-plugin` wiring operation registers this factory in
 * `features/identity/auth.ts`; the tables it writes live in `schema.ts` and the `auth-schema`
 * operation adds them to the drizzle adapter.
 *
 * Teams stay disabled (the plugin default): this feature ships no team/team_member tables.
 */
export function createOrganizationPlugin() {
  return organization();
}
