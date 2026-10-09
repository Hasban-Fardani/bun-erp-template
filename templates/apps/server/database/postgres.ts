import type { PgDatabase } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/**
 * The query surface shared by the root client and a transaction. Typing it as `PgDatabase`
 * (instead of `PostgresJsDatabase`, which adds `$client`) lets a `tx` from `db.transaction()` be
 * passed wherever a `Database` is expected, with no cast.
 */
export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export type SslMode = "disable" | "require" | "verify-full";

export type PostgresLogger = { warn: (fields: Record<string, unknown>) => void };

export type PostgresSettings = {
  max?: number;
  fetchTypes?: boolean;
  /**
   * `DATABASE_SSL_MODE`. Leave it undefined when something else owns the origin TLS (Cloudflare
   * Hyperdrive terminates it), so the connection string alone decides.
   */
  sslMode?: SslMode;
  logger?: PostgresLogger;
  /** Called with the SQL text of every statement sent; diagnostics only (query budgets, tests). */
  onQuery?: (sql: string) => void;
};

type SslOption = false | "require" | { rejectUnauthorized: true };

/** `DATABASE_SSL_MODE` -> postgres.js `ssl` option. */
export function sslOptionFor(mode: SslMode): SslOption {
  if (mode === "require") return "require";
  if (mode === "verify-full") return { rejectUnauthorized: true };
  return false;
}

function normaliseUrlMode(value: string): string {
  return value === "false" ? "disable" : value;
}

function urlSslMode(connectionString: string): string | undefined {
  try {
    const params = new URL(connectionString).searchParams;
    const value = params.get("sslmode") ?? params.get("ssl");
    return value === null ? undefined : normaliseUrlMode(value);
  } catch {
    return undefined;
  }
}

export type ResolvedPostgresOptions = {
  options: postgres.Options<Record<string, never>>;
  /** Set when the URL carries an `sslmode` that disagrees with the configured mode. */
  mismatch?: string;
};

/**
 * postgres.js lets an explicit `ssl` option beat the URL, so the option is only set when the
 * URL says nothing about TLS: a `sslmode=` already in the connection string wins.
 */
export function resolvePostgresOptions(connectionString: string, settings: PostgresSettings): ResolvedPostgresOptions {
  const options: postgres.Options<Record<string, never>> = {
    max: settings.max ?? 10,
    fetch_types: settings.fetchTypes ?? true,
    prepare: true,
    onnotice: () => {},
  };
  const { onQuery } = settings;
  if (onQuery) options.debug = (_connection, query) => onQuery(query);
  if (settings.sslMode === undefined) return { options };

  const fromUrl = urlSslMode(connectionString);
  if (fromUrl === undefined) {
    options.ssl = sslOptionFor(settings.sslMode);
    return { options };
  }
  if (fromUrl === settings.sslMode) return { options };
  return {
    options,
    mismatch: `connection string sslmode=${fromUrl} wins over DATABASE_SSL_MODE=${settings.sslMode}`,
  };
}

const reported = new Set<string>();

export function createPostgresDatabase(
  connectionString: string,
  max = 10,
  fetchTypes = true,
  extra: PostgresSettings = {},
) {
  const { options, mismatch } = resolvePostgresOptions(connectionString, { ...extra, max, fetchTypes });
  if (mismatch !== undefined && !reported.has(mismatch)) {
    reported.add(mismatch);
    extra.logger?.warn({ event: "database.ssl_mode_mismatch", detail: mismatch });
  }
  const client = postgres(connectionString, options);
  return {
    db: drizzle(client, { schema }) satisfies Database as Database,
    close: () => client.end({ timeout: 1 }),
  };
}
