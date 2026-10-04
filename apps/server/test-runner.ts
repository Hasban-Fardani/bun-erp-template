import postgres from "postgres";

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  const child = Bun.spawn(["bun", "test", "apps/server"], { stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}
const name = `erp_test_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = postgres(target, { max: 1 });
await admin.unsafe(`create database "${name}"`);
const url = new URL(target);
url.pathname = `/${name}`;
let code = 1;
try {
  const child = Bun.spawn(["bun", "test", "apps/server"], {
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
