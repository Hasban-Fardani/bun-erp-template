import { eq } from "drizzle-orm";
import { type Env, loadEnv } from "./platform/config/index.ts";
import { createDatabase, type Database } from "./platform/database/index.ts";
import { migrate } from "./platform/database/migrate.ts";
import { organizations } from "./platform/database/schema.ts";
import { createLogger, type Logger } from "./platform/observability/logger.ts";

/**
 * Composition root: satu tempat yang tahu bagaimana potongan disusun. Modul menerima
 * context ini lewat parameter — tidak ada state global tersembunyi (PRD §3 explicit over magic).
 *
 * Context sengaja TIDAK memuat organisasi: perintah seperti `db:migrate` harus bisa jalan
 * sebelum tabelnya ada. Organisasi diselesaikan terpisah lewat `resolveDefaultOrganizationId`.
 */
export type AppContext = {
  env: Env;
  db: Database;
  logger: Logger;
  close: () => Promise<void>;
};

export type BootstrapOptions = {
  env?: Env;
  /** `false` untuk perintah yang mengurus migrasi sendiri. */
  migrateOnStart?: boolean;
  migrationsDir?: string;
};

const MIGRATIONS_DIR = new URL("./migrations", import.meta.url).pathname;

export async function createContext(options: BootstrapOptions = {}): Promise<AppContext> {
  const env = options.env ?? loadEnv();
  const logger = createLogger(env);
  const { db, close } = createDatabase(env);

  if (options.migrateOnStart !== false) {
    const ran = await migrate(db, options.migrationsDir ?? MIGRATIONS_DIR);
    if (ran.length > 0) logger.info({ event: "database.migrated", migrations: ran });
  }

  return { env, db, logger, close };
}

/** Modul bisnis tidak boleh mengarang organisasi sendiri: bagian ini yang menyelesaikannya. */
export async function resolveDefaultOrganizationId(db: Database, slug = "default"): Promise<string> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error("Default organization missing — run `bun erp db:seed`");
  return id;
}
