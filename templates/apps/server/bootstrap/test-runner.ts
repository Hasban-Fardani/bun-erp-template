import postgres from "postgres";

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  process.stderr.write(
    "TEST_DATABASE_URL is required. Point it at a disposable PostgreSQL database; the test runner creates and drops an isolated erp_test_* database. Never use production credentials.\n",
  );
  process.exit(78);
}
const name = `erp_test_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = postgres(target, { max: 1 });
await admin.unsafe(`create database "${name}"`);
const url = new URL(target);
url.pathname = `/${name}`;
let code = 1;
try {
  const child = Bun.spawn(["bun", "test", "--parallel=1", "--timeout=15000", "apps/server"], {
    env: { ...process.env, TEST_DATABASE_URL: url.toString() },
    stdout: "inherit",
    stderr: "inherit",
  });
  code = await child.exited;
} finally {
  await admin.unsafe(`drop database "${name}" with (force)`);
  await admin.end();
}
process.exit(code);
