const { email, password } = await Bun.file(".data/qa/credentials.json").json();
const child = Bun.spawn(["bun", "cli/index.ts", "user:create", email, password, "owner", "Admin"], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
