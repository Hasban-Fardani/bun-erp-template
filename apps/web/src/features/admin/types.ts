/** Shape of the admin API response — matched to the server service, not invented. */
export type Role = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  organizationId: string;
  permissions: string[];
};

/** Statement catalog from code (`/roles/statements`) — the source for the permission screen, not copied. */
export type RoleStatements = {
  statements: Record<string, string[]>;
  permissions: string[];
  systemRoles: { key: string; name: string; description: string; permissions: string[] }[];
};

export type AuditLog = {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  actorLabel: string;
  event: string;
  subjectType: string;
  subjectId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  traceId: string;
  createdAt: string;
};
