/** Identity query-key factory: one owner for the `session` prefix shared by guards and hooks. */
export const identityKeys = {
  session: ["session"] as const,
  authOptions: ["auth-options"] as const,
};
