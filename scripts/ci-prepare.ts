const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the isolated CI database");
const password = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
const secret = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
const values: Record<string, string> = {
  APP_ENV: "production",
  APP_URL: "http://localhost:3000",
  APP_RELEASE: "ci",
  LOG_LEVEL: "info",
  DATABASE_DRIVER: "postgres",
  DATABASE_URL: databaseUrl,
  STORAGE_DRIVER: "s3",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: secret,
  AUTH_TRUSTED_ORIGINS: "http://localhost:3000,http://localhost:4173",
  VITE_API_BASE_URL: "",
};
const example = await Bun.file(".env.example").text();
await Bun.write(
  ".env",
  example.replace(/^([A-Z_]+)=.*$/gm, (line, key: string) =>
    key in values ? `${key}=${JSON.stringify(values[key])}` : line,
  ),
);
if (process.env.GITHUB_ENV) {
  console.log(`::add-mask::${password}`);
  console.log(`::add-mask::${secret}`);
  await Bun.write(
    process.env.GITHUB_ENV,
    `QA_EMAIL=admin@example.test\nQA_PASSWORD=${password}\nQA_BASE_URL=http://localhost:4173\n`,
  );
}
await Bun.write(".data/qa/credentials.json", JSON.stringify({ email: "admin@example.test", password }));
