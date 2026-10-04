import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./index.ts";
import * as schema from "./schema.ts";

export function createPostgresDatabase(connectionString: string, max = 10, fetchTypes = true) {
  const client = postgres(connectionString, { max, fetch_types: fetchTypes, prepare: true, onnotice: () => {} });
  return {
    db: drizzle(client, { schema }) as unknown as Database,
    close: () => client.end({ timeout: 1 }),
  };
}
