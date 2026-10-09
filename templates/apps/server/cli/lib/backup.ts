export type BackupInput = {
  databaseUrl: string;
  appEnv: string;
  output: string;
  force: boolean;
  /** Whether `output` already exists; the caller checks with `Bun.file(output).exists()`. */
  exists: boolean;
};

export type BackupPlan = { args: string[]; env: Record<string, string> };

/**
 * Builds the pg_dump invocation. The connection travels in PG* variables so the password never
 * appears in `ps` output, and no error message repeats the URL.
 */
export function planBackup(input: BackupInput): BackupPlan {
  if (input.databaseUrl.trim() === "") throw new Error("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }
  const { exists } = input;
  if (exists && input.appEnv === "production") {
    throw new Error(`Refusing to overwrite ${input.output} with APP_ENV=production; choose a new file name.`);
  }
  if (exists && !input.force) throw new Error(`${input.output} already exists; pass --force to overwrite.`);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return {
    args: ["--format=custom", "--no-owner", "--no-privileges", "--file", input.output],
    env,
  };
}
