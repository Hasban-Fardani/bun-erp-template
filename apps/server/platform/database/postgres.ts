import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = PostgresJsDatabase<typeof schema>;

export function createPostgresDatabase(connectionString: string, max = 10, fetchTypes = true) {
  const client = postgres(connectionString, { max, fetch_types: fetchTypes, prepare: true, onnotice: () => {} });
  return {
    db: drizzle(client, { schema }) as unknown as Database,
    close: () => client.end({ timeout: 1 }),
  };
}
