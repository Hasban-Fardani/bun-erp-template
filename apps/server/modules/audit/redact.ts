/** Redaksi audit terpusat: allowlist per entitas, default TOLAK (ADR-0007). */

/** Field yang selalu dibuang, walaupun entitasnya mendaftarkannya di allowlist. */
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

/** Nama field yang mengandung penanda rahasia/PII, dicocokkan tanpa peduli besar-kecil. */
const REDACT_HINTS = ["secret", "token", "password", "passwd", "credential", "api_key", "apikey"] as const;

function isAlwaysRedacted(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return (ALWAYS_REDACT as readonly string[]).includes(normalized);
}

function looksSecret(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_HINTS.some((hint) => normalized.includes(hint));
}

/** Field di luar allowlist hilang dari audit — bukan bocor ke audit. */
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
    // Buffer/typed array bisa memuat kunci biner; jangan pernah diserialisasi.
    if (ArrayBuffer.isView(value)) continue;
    out[key] = value;
  }
  return out;
}

/** Allowlist per entitas. Entitas baru wajib menambah barisnya di sini. */
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
