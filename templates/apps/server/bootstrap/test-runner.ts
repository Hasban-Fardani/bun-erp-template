import postgres from "postgres";

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  process.stderr.write(
    "TEST_DATABASE_URL is required. Point it at a disposable PostgreSQL database; the test runner creates and drops an isolated erp_test_* database. Never use production credentials.\n",
  );
  process.exit(78);
}
// One explicit per-test budget, equal to bunfig.toml. These are integration tests against a real
// database, so a loaded CI machine needs headroom; a lower runner-only value made the suite flaky.
const timeout = Number(process.env.TEST_TIMEOUT_MS ?? "30000");
if (!Number.isInteger(timeout) || timeout < 1000) {
  process.stderr.write("TEST_TIMEOUT_MS must be an integer number of milliseconds, at least 1000.\n");
  process.exit(78);
}
const name = `erp_test_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = postgres(target, { max: 1 });
await admin.unsafe(`create database "${name}"`);
const url = new URL(target);
url.pathname = `/${name}`;
let code = 1;
try {
  // `bun loom test --filter <feature>` passes the feature's test path; no path means the whole suite.
  const roots = process.argv.slice(2);
  const child = Bun.spawn(
    ["bun", "test", "--parallel=1", `--timeout=${timeout}`, ...(roots.length > 0 ? roots : ["apps/server"])],
    {
      env: { ...process.env, TEST_DATABASE_URL: url.toString() },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  code = await child.exited;
} finally {
  await admin.unsafe(`drop database "${name}" with (force)`);
  await admin.end();
}
process.exit(code);
