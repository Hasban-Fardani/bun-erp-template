import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import pino, { type Logger } from "pino";
import type { Env } from "../config/index.ts";

/**
 * Redaction terpusat: rahasia tidak pernah masuk log (FAILURE-TRACEABILITY-GOVERNANCE §12).
 * Ditulis di satu tempat supaya modul tidak perlu mengingat aturannya.
 */
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "*.password",
  "*.token",
  "*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
];

function destination(env: Env): pino.DestinationStream {
  if (env.LOG_DRIVER === "console") return pino.destination({ dest: 1, sync: false });

  if (!isAbsolute(env.LOG_PATH)) {
    throw new Error("LOG_PATH must be absolute when LOG_DRIVER=daily");
  }
  mkdirSync(dirname(env.LOG_PATH), { recursive: true });
  return pino.destination({ dest: env.LOG_PATH, sync: false, mkdir: true });
}

/** Satu logger untuk API, worker, scheduler, dan CLI (PRD §13). */
export function createLogger(env: Env): Logger {
  return pino(
    {
      level: env.LOG_LEVEL,
      base: { service: "bun-erp", environment: env.APP_ENV, release: env.APP_RELEASE },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
    destination(env),
  );
}

export type { Logger };
