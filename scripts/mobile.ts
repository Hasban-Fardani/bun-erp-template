const [command, platform] = process.argv.slice(2);
if (!["build", "add", "sync", "open"].includes(command ?? "")) {
  throw new Error("Use bun erp mobile:build|mobile:add|mobile:sync|mobile:open [android|ios]");
}
if (command !== "build" && platform !== "android" && platform !== "ios") {
  throw new Error("Choose android or ios");
}

if (command === "build") {
  const origin = process.env.VITE_API_BASE_URL?.trim();
  if (!origin || !origin.startsWith("https://")) throw new Error("Mobile requires an absolute HTTPS VITE_API_BASE_URL");
  const api = new URL(origin);
  if (api.protocol !== "https:" || api.pathname !== "/" || api.search || api.hash || api.username || api.password) {
    throw new Error(
      "Mobile requires VITE_API_BASE_URL to be an absolute HTTPS API origin without a path or credentials",
    );
  }
}

const argv =
  command === "build"
    ? [
        "bun",
        "run",
        "--cwd",
        "apps/web",
        "build",
        "--mode",
        "mobile",
        "--base",
        "./",
        "--outDir",
        "../mobile/www",
        "--emptyOutDir",
      ]
    : [
        "bun",
        Bun.resolveSync("@capacitor/cli/bin/capacitor", import.meta.dir + "/../apps/mobile"),
        command ?? "",
        platform ?? "",
      ];
const child = Bun.spawn(argv, {
  cwd: command === "build" ? import.meta.dir + "/.." : import.meta.dir + "/../apps/mobile",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
