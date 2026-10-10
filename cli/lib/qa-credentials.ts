/** QA credentials written by `bun loom ci:prepare` and consumed by `bun loom ci:owner`. */
export type QaCredentials = { email: string; password: string };

/**
 * Validates the credentials file before an owner account is created, so a malformed or truncated
 * `.data/qa/credentials.json` fails with a pointer instead of an undefined account. The password
 * minimum mirrors the identity schema; a shorter value would be rejected later anyway.
 */
export function parseQaCredentials(raw: unknown): QaCredentials {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error('.data/qa/credentials.json must be a JSON object with "email" and "password"');
  }
  const { email, password } = raw as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('.data/qa/credentials.json: "email" must be a valid address');
  }
  if (typeof password !== "string" || password.length < 10) {
    throw new Error(
      '.data/qa/credentials.json: "password" must be a string of at least 10 characters (the identity schema minimum)',
    );
  }
  return { email, password };
}
