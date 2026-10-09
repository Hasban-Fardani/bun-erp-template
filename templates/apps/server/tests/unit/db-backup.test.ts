import { expect, test } from "bun:test";
import { planBackup } from "../../cli/lib/backup.ts";

const url = "postgresql://erp_user:s3cret@db.example.com:6543/erp?sslmode=require";

test("the plan passes the connection through PG* variables, never argv", () => {
  const plan = planBackup({
    databaseUrl: url,
    appEnv: "development",
    output: "backups/x.dump",
    exists: false,
    force: false,
  });
  expect(plan.args).toEqual(["--format=custom", "--no-owner", "--no-privileges", "--file", "backups/x.dump"]);
  expect(plan.args.join(" ")).not.toContain("s3cret");
  expect(plan.env).toMatchObject({
    PGHOST: "db.example.com",
    PGPORT: "6543",
    PGUSER: "erp_user",
    PGPASSWORD: "s3cret",
    PGDATABASE: "erp",
    PGSSLMODE: "require",
  });
});

test("an empty DATABASE_URL is refused without echoing anything", () => {
  expect(() =>
    planBackup({ databaseUrl: "", appEnv: "development", output: "x", exists: false, force: false }),
  ).toThrow("DATABASE_URL is not set");
});

test("an invalid URL error never contains the URL", () => {
  try {
    planBackup({ databaseUrl: "not a url s3cret", appEnv: "development", output: "x", exists: false, force: false });
    throw new Error("expected failure");
  } catch (error) {
    expect(String(error)).not.toContain("s3cret");
  }
});

test("production never overwrites an existing dump", () => {
  expect(() =>
    planBackup({ databaseUrl: url, appEnv: "production", output: "a.dump", force: true, exists: true }),
  ).toThrow("Refusing to overwrite");
  expect(() =>
    planBackup({ databaseUrl: url, appEnv: "development", output: "a.dump", force: false, exists: true }),
  ).toThrow("already exists");
  expect(() =>
    planBackup({ databaseUrl: url, appEnv: "development", output: "a.dump", force: true, exists: true }),
  ).not.toThrow();
});
