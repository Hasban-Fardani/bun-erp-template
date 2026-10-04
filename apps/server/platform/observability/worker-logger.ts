import type { Logger } from "./logger.ts";

const PRIVATE_FIELD =
  /password|secret|token|authorization|cookie|email|phone|address|user(id)?|organization(id)?|session/i;

/** Workers write structured JSON to platform logs and never retain per-request logger state. */
export function createWorkerLogger(service: string, environment: string, release: string): Logger {
  const write = (level: keyof Logger, fields: Record<string, unknown>) => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      release,
      ...redact(fields),
    };
    const sink = level === "fatal" || level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(JSON.stringify(record));
  };

  return {
    trace: (fields) => write("trace", fields),
    debug: (fields) => write("debug", fields),
    info: (fields) => write("info", fields),
    warn: (fields) => write("warn", fields),
    error: (fields) => write("error", fields),
    fatal: (fields) => write("fatal", fields),
  };
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, PRIVATE_FIELD.test(key) ? "[REDACTED]" : value]),
  );
}
