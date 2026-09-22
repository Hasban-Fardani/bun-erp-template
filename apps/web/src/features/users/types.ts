/** Public user response type — matched to `toPublicUser` on the server, not invented. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  organizationId: string | null;
  createdAt: string;
  roles: {
    roleId: string;
    key: string;
    name: string;
    scopeType: "organization" | "department" | null;
    scopeId: string | null;
  }[];
  permissions: string[];
};

export type SessionView = {
  authenticated: boolean;
  user: { id: string; name: string; email: string } | null;
  permissions: string[];
};
