import { hashPassword as scryptHash, verifyPassword as scryptVerify } from "better-auth/crypto";

/**
 * Password hashing for Better Auth (`emailAndPassword.password`).
 *
 * - `pbkdf2`: Web Crypto PBKDF2-HMAC-SHA256. Runs in Bun and workerd with no dependency and fits the
 *   10 ms CPU budget of Workers Free. Stored as `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`.
 * - `scrypt`: Better Auth's own implementation (memory-hard, ~110 ms CPU) for hosts with no CPU cap.
 *
 * Stored hashes are self-describing: `verify` looks at the stored format, never at the setting, so the
 * algorithm can be switched in either direction without locking anyone out.
 */
export type PasswordAlgorithm = "pbkdf2" | "scrypt";

export type PasswordHasherOptions = { algorithm: PasswordAlgorithm; iterations: number };

/** workerd rejects PBKDF2 above 100,000 iterations (NotSupportedError), so every stored hash stays within it. */
export const MAX_PBKDF2_ITERATIONS = 100_000;
export const MIN_PBKDF2_ITERATIONS = 1_000;
/** ~2.3 ms per hash on idle Apple-silicon Bun (3.6 ms under load): well inside the 10 ms Workers Free budget. */
export const DEFAULT_PBKDF2_ITERATIONS = 30_000;

const PREFIX = "pbkdf2-sha256";
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Length-independent XOR accumulation: no early exit on the first differing byte. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function verifyPbkdf2(stored: string, password: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [, iterationText = "", saltText = "", keyText = ""] = parts;
  if (!/^[1-9]\d{0,6}$/.test(iterationText)) return false;
  const iterations = Number(iterationText);
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) return false;
  const salt = fromBase64(saltText);
  const expected = fromBase64(keyText);
  if (!salt || !expected || salt.length === 0 || expected.length !== KEY_BITS / 8) return false;
  return constantTimeEqual(await derive(password, salt, iterations), expected);
}

export function createPasswordHasher(options: PasswordHasherOptions) {
  const { algorithm, iterations } = options;
  if (
    algorithm === "pbkdf2" &&
    (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS)
  ) {
    throw new Error(
      `PASSWORD_HASH_ITERATIONS: pbkdf2 iterations must be an integer from ${MIN_PBKDF2_ITERATIONS} to ${MAX_PBKDF2_ITERATIONS}.`,
    );
  }
  return {
    async hash(password: string): Promise<string> {
      if (algorithm === "scrypt") return scryptHash(password);
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      const key = await derive(password, salt, iterations);
      return [PREFIX, iterations, toBase64(salt), toBase64(key)].join("$");
    },
    async verify(input: { hash: string; password: string }): Promise<boolean> {
      if (input.hash.startsWith(`${PREFIX}$`)) return verifyPbkdf2(input.hash, input.password);
      try {
        return await scryptVerify(input);
      } catch {
        return false;
      }
    },
  };
}

/** The hasher configured by `PASSWORD_HASH` / `PASSWORD_HASH_ITERATIONS`. */
export const passwordHasherFor = (env: { PASSWORD_HASH: PasswordAlgorithm; PASSWORD_HASH_ITERATIONS: number }) =>
  createPasswordHasher({ algorithm: env.PASSWORD_HASH, iterations: env.PASSWORD_HASH_ITERATIONS });

const defaultHasher = createPasswordHasher({ algorithm: "pbkdf2", iterations: DEFAULT_PBKDF2_ITERATIONS });

/** Fallback for callers without an `Env` (tests, scripts); app code passes `passwordHasherFor(env).hash`. */
export const hashPassword = defaultHasher.hash;
