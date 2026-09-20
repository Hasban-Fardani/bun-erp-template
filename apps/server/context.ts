import { type Auth, createAuth } from "./modules/identity/auth.ts";
import { type Env, loadEnv } from "./platform/config/index.ts";
import { createDatabase, type Database } from "./platform/database/index.ts";
import { migrate } from "./platform/database/migrate.ts";
import { createLogger, type Logger } from "./platform/observability/logger.ts";

export { resolveDefaultOrganizationId } from "./platform/database/organizations.ts";

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
  auth: Auth;
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

  const auth = createAuth(env, db);

  return { env, db, logger, auth, close };
}
