const child = Bun.spawn(["bun", "apps/web/tests/browser/admin-workflow.ts"], { stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
