type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Readonly<Record<string, unknown>>;

const PRIVATE_FIELD =
  /password|secret|token|authorization|cookie|email|phone|address|user(id)?|organization(id)?|session/i;
const CREDENTIAL_VALUE = /\b(bearer\s+)[a-z0-9._~+/-]+=*/gi;

/** Mobile diagnostics use structured events with identifiers instead of personal or secret data. */
export function createMobileLogger(area: string) {
  const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
    if (level === "debug" && !import.meta.env.DEV) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      area,
      event,
      ...sanitize(fields),
    };
    console[level](JSON.stringify(record));
  };

  return {
    debug: (event: string, fields?: LogFields) => write("debug", event, fields),
    info: (event: string, fields?: LogFields) => write("info", event, fields),
    warn: (event: string, fields?: LogFields) => write("warn", event, fields),
    error: (event: string, fields?: LogFields) => write("error", event, fields),
  };
}

function sanitize(fields: LogFields): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

function sanitizeValue(key: string, value: unknown, seen = new WeakSet<object>()): unknown {
  if (PRIVATE_FIELD.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.replace(CREDENTIAL_VALUE, "$1[REDACTED]");
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(key, entry, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeValue(childKey, childValue, seen)]),
  );
}
