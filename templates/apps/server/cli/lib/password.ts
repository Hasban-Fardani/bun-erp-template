/**
 * One-time password for `bun erp user:passwd` when no value is supplied.
 * 16 bytes from the platform CSPRNG → 22 base64url characters (~128 bits of entropy).
 * `Math.random()` is never acceptable for a credential.
 */
export function generatePassword(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
}
