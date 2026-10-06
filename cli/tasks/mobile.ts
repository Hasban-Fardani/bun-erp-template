const [command, platform, ...args] = process.argv.slice(2);
const ROOT = `${import.meta.dir}/../..`;
const MOBILE_DIR = `${ROOT}/apps/mobile`;
const KNOWN_COMMANDS = ["build", "add", "sync", "open", "package"];

// Mobile is a catalog app: the template ships no apps until `bun erp init` installs a combination.
// Point at the init flow instead of failing on a missing directory.
if (!(await Bun.file(`${MOBILE_DIR}/package.json`).exists())) {
  process.stderr.write(
    "apps/mobile is not installed. Run `bun erp init` (choose a combination with mobile) or `bun erp apps:create mobile mobile`, then bun install.\n",
  );
  process.exit(1);
}

if (!KNOWN_COMMANDS.includes(command ?? "")) {
  throw new Error(
    "Use bun erp mobile:build|mobile:add|mobile:sync|mobile:open|mobile:package [android|ios] [--mode debug|production]",
  );
}
if (command !== "build" && platform !== "android" && platform !== "ios") {
  throw new Error("Choose android or ios");
}

async function spawn(argv: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(argv, { cwd, stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}

type PackageMode = "debug" | "production";

function parseMode(value: string): PackageMode {
  if (value === "debug" || value === "production") return value;
  throw new Error(`--mode must be debug or production, got "${value}"`);
}

/** Splits `--mode` out of the Capacitor pass-through args; debug rebuilds natively without `cap build`. */
function splitMode(input: readonly string[]): { mode: PackageMode; forwarded: string[] } {
  const forwarded: string[] = [];
  let mode: PackageMode = "production";
  for (let index = 0; index < input.length; index += 1) {
    const arg = input[index] ?? "";
    if (arg === "--mode") {
      const value = input[index + 1];
      if (value === undefined) throw new Error("--mode requires a value: debug or production");
      mode = parseMode(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      mode = parseMode(arg.slice("--mode=".length));
      continue;
    }
    forwarded.push(arg);
  }
  return { mode, forwarded };
}

if (command === "build") {
  const origin = process.env.VITE_API_BASE_URL?.trim();
  if (!origin?.startsWith("https://")) throw new Error("Mobile requires an absolute HTTPS VITE_API_BASE_URL");
  const api = new URL(origin);
  if (api.protocol !== "https:" || api.pathname !== "/" || api.search || api.hash || api.username || api.password) {
    throw new Error(
      "Mobile requires VITE_API_BASE_URL to be an absolute HTTPS API origin without a path or credentials",
    );
  }
  await spawn(["bun", "run", "--cwd", "apps/mobile", "build"], ROOT);
}

const capCli = Bun.resolveSync("@capacitor/cli/bin/capacitor", MOBILE_DIR);

/**
 * `cap build` only produces the release version. Debug packaging syncs the web assets first, then runs
 * the platform's own debug build so the output is an unsigned, installable debug artifact.
 */
async function packageDebug(target: "android" | "ios"): Promise<void> {
  const sync = Bun.spawn([capCli, "sync", target], { cwd: MOBILE_DIR, stdout: "inherit", stderr: "inherit" });
  if ((await sync.exited) !== 0) process.exit(1);
  const argv =
    target === "android"
      ? ["bash", "apps/mobile/android/gradlew", "-p", "apps/mobile/android", "assembleDebug"]
      : [
          "xcodebuild",
          "-project",
          "apps/mobile/ios/App/App.xcodeproj",
          "-scheme",
          "App",
          "-sdk",
          "iphonesimulator",
          "-configuration",
          "Debug",
          "-derivedDataPath",
          ".data/mobile-ios",
          "CODE_SIGNING_ALLOWED=NO",
          "build",
        ];
  await spawn(argv, ROOT);
}

if (command === "package") {
  const { mode, forwarded } = splitMode(args);
  if (mode === "debug") await packageDebug(platform as "android" | "ios");
  await spawn([capCli, "build", platform ?? "", ...forwarded], MOBILE_DIR);
}

await spawn([capCli, command ?? "", platform ?? "", ...args], MOBILE_DIR);
