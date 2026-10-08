import { describe, expect, test } from "bun:test";
import { hashPassword as scryptHash } from "better-auth/crypto";
import { loadEnv } from "../../config/index.ts";
import {
  createPasswordHasher,
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
} from "../../features/identity/password.ts";

const pbkdf2 = createPasswordHasher({ algorithm: "pbkdf2", iterations: 1000 });
const scrypt = createPasswordHasher({ algorithm: "scrypt", iterations: 1000 });
const password = "correct horse battery staple";

describe("password hasher", () => {
  test("pbkdf2 round-trips and stores a self-describing hash", async () => {
    const stored = await pbkdf2.hash(password);
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(await pbkdf2.verify({ hash: stored, password })).toBe(true);
    expect(await pbkdf2.verify({ hash: stored, password: `${password}!` })).toBe(false);
  });

  test("salts every hash", async () => {
    expect(await pbkdf2.hash(password)).not.toBe(await pbkdf2.hash(password));
  });

  test("verify dispatches on the stored format, whatever the current setting", async () => {
    const legacy = await scryptHash(password);
    expect(await pbkdf2.verify({ hash: legacy, password })).toBe(true);
    expect(await pbkdf2.verify({ hash: legacy, password: "wrong password" })).toBe(false);
    const fresh = await pbkdf2.hash(password);
    expect(await scrypt.verify({ hash: fresh, password })).toBe(true);
    expect(await scrypt.verify({ hash: await scrypt.hash(password), password })).toBe(true);
  });

  test("verify uses the stored iteration count, not the configured one", async () => {
    const other = createPasswordHasher({ algorithm: "pbkdf2", iterations: 2000 });
    expect(await other.verify({ hash: await pbkdf2.hash(password), password })).toBe(true);
  });

  test("rejects tampered or malformed hashes without throwing", async () => {
    const stored = await pbkdf2.hash(password);
    const [alg, iter, salt, key] = stored.split("$") as [string, string, string, string];
    const flipped = `${key.startsWith("A") ? "B" : "A"}${key.slice(1)}`;
    const bad = [
      [alg, iter, salt, flipped].join("$"),
      [alg, iter, salt].join("$"),
      [alg, iter, salt, key, "extra"].join("$"),
      [alg, "abc", salt, key].join("$"),
      [alg, "2000", salt, key].join("$"),
      [alg, "0", salt, key].join("$"),
      [alg, String(MAX_PBKDF2_ITERATIONS + 1), salt, key].join("$"),
      [alg, String(MIN_PBKDF2_ITERATIONS - 1), salt, key].join("$"),
      [alg, iter, "!!!", key].join("$"),
      "pbkdf2-sha256$",
      "",
    ];
    for (const hash of bad) expect(await pbkdf2.verify({ hash, password })).toBe(false);
  });

  test("hash refuses an iteration count outside the supported bounds", () => {
    for (const iterations of [MIN_PBKDF2_ITERATIONS - 1, MAX_PBKDF2_ITERATIONS + 1, 1.5]) {
      expect(() => createPasswordHasher({ algorithm: "pbkdf2", iterations })).toThrow(/iterations/);
    }
  });

  test("the default stays under the workerd cap with Free-plan headroom", () => {
    expect(DEFAULT_PBKDF2_ITERATIONS).toBeLessThanOrEqual(MAX_PBKDF2_ITERATIONS);
    expect(MAX_PBKDF2_ITERATIONS).toBe(100_000);
  });
});

describe("password hash benchmark (informational)", () => {
  test("reports pbkdf2 sign-in cost at the default iterations", async () => {
    const hasher = createPasswordHasher({ algorithm: "pbkdf2", iterations: DEFAULT_PBKDF2_ITERATIONS });
    const stored = await hasher.hash(password);
    const samples: number[] = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      await hasher.verify({ hash: stored, password });
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[7] ?? 0;
    console.log(`pbkdf2-sha256 ${DEFAULT_PBKDF2_ITERATIONS} iterations: median ${median.toFixed(2)} ms verify`);
    expect(median).toBeLessThan(50);
  });
});

describe("password hash config", () => {
  const base: Record<string, string> = {
    APP_NAME: "x",
    APP_ENV: "test",
    APP_URL: "http://localhost:3000",
    APP_PORT: "3000",
    APP_RELEASE: "t",
    APP_TIMEZONE: "UTC",
    LOG_DRIVER: "console",
    LOG_LEVEL: "info",
    LOG_PATH: "stdout",
    LOG_RETENTION_DAYS: "1",
    LOG_MAX_SIZE_MB: "1",
    DATABASE_URL: "postgresql://u:p@localhost:5432/d",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "x".repeat(40),
    AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
    STORAGE_DRIVER: "local",
    MAIL_DRIVER: "log",
    MAIL_FROM_ADDRESS: "a@example.test",
    MAIL_FROM_NAME: "x",
  };

  test("defaults to pbkdf2 with the default iterations", () => {
    const env = loadEnv(base);
    expect(env.PASSWORD_HASH).toBe("pbkdf2");
    expect(env.PASSWORD_HASH_ITERATIONS).toBe(DEFAULT_PBKDF2_ITERATIONS);
  });

  test("accepts scrypt and rejects unknown algorithms or out-of-range iterations", () => {
    expect(loadEnv({ ...base, PASSWORD_HASH: "scrypt" }).PASSWORD_HASH).toBe("scrypt");
    expect(() => loadEnv({ ...base, PASSWORD_HASH: "md5" })).toThrow(/PASSWORD_HASH/);
    expect(() => loadEnv({ ...base, PASSWORD_HASH_ITERATIONS: "100001" })).toThrow(/PASSWORD_HASH_ITERATIONS/);
    expect(() => loadEnv({ ...base, PASSWORD_HASH_ITERATIONS: "10" })).toThrow(/PASSWORD_HASH_ITERATIONS/);
  });
});
