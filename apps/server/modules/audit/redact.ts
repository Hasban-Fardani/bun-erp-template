/** Central audit redaction: allowlist per entity, DENY by default (ADR-0007). */

/** Fields always dropped, even when their entity lists them in the allowlist. */
const ALWAYS_REDACT = [
  "password",
  "passwordhash",
  "password_hash",
  "secret",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "idtoken",
  "id_token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "sessiontoken",
  "session_token",
  "privatekey",
  "private_key",
] as const;

/** Field names containing a secret/PII marker, matched case-insensitively. */
const REDACT_HINTS = ["secret", "token", "password", "passwd", "credential", "api_key", "apikey"] as const;

function isAlwaysRedacted(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return (ALWAYS_REDACT as readonly string[]).includes(normalized);
}

function looksSecret(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_HINTS.some((hint) => normalized.includes(hint));
}

/** Fields outside the allowlist vanish from the audit — they do not leak into it. */
export function redact<T extends Record<string, unknown>>(
  entity: string,
  record: T | undefined,
  allowed: readonly (keyof T & string)[],
): Record<string, unknown> | null {
  if (!record) return null;

  const out: Record<string, unknown> = { entity };
  for (const key of allowed) {
    if (isAlwaysRedacted(key) || looksSecret(key)) continue;
    const value = record[key];
    if (value === undefined) continue;
    // Buffers/typed arrays can hold binary keys; never serialize them.
    if (ArrayBuffer.isView(value)) continue;
    out[key] = value;
  }
  return out;
}

/** Allowlist per entity. A new entity must add its row here. */
export const AUDIT_FIELDS = {
  user: ["id", "name", "email", "emailVerified", "organizationId", "createdAt"],
  role: ["id", "key", "name", "isSystem", "organizationId"],
  userRole: ["userId", "roleId", "scopeType", "scopeId"],
  department: ["id", "name", "code", "isActive", "organizationId"],
} as const satisfies Record<string, readonly string[]>;

export type AuditEntity = keyof typeof AUDIT_FIELDS;

export function redactEntity<T extends Record<string, unknown>>(entity: AuditEntity, record: T | undefined) {
  return redact(entity, record, AUDIT_FIELDS[entity] as readonly (keyof T & string)[]);
}
