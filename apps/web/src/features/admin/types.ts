export type Role = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  organizationId: string;
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
