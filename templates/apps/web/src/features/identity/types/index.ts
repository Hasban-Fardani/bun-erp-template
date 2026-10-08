export type SessionView = {
  authenticated: boolean;
  user: { id: string; name: string; email: string } | null;
  permissions: readonly string[];
  /** Set while an admin views the app as `user`; drives the persistent banner. */
  impersonation?: { by: { name: string; email: string }; expiresAt: string } | null;
};
