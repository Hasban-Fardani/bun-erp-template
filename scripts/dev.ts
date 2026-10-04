import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const apiPort = portFromEnvironment("DEV_API_PORT", 3000);
const webPort = portFromEnvironment("DEV_WEB_PORT", 5173);
const webUrl = `http://localhost:${webPort}`;

const exampleEnvironment = await readExampleEnvironment();
const systemEnvironment = pickSystemEnvironment();
const serverEnvironment = {
  ...systemEnvironment,
  ...exampleEnvironment,
  APP_ENV: "development",
  APP_PORT: String(apiPort),
  APP_RELEASE: "local",
  APP_URL: webUrl,
  AUTH_TRUSTED_ORIGINS: `${webUrl},http://127.0.0.1:${webPort}`,
  BETTER_AUTH_SECRET: createLocalAuthSecret(),
  BETTER_AUTH_URL: webUrl,
  DATABASE_DRIVER: "pglite",
  DATABASE_PATH: resolve(root, ".data/development"),
  DATABASE_URL: "",
};
const webEnvironment = {
  ...systemEnvironment,
  NODE_ENV: "development",
  API_PORT: String(apiPort),
  VITE_API_BASE_URL: "",
};

await Bun.$`mkdir -p ${resolve(root, ".data")}`.quiet();

const processes: { name: string; child: Bun.Subprocess }[] = [];

try {
  processes.push({
    name: "API",
    child: Bun.spawn([process.execPath, "--no-env-file", "--watch", "server.ts"], {
      cwd: resolve(root, "apps/server"),
      env: serverEnvironment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  });
  processes.push({
    name: "Web",
    child: Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        "run",
        "vite",
        "--host",
        "localhost",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        cwd: resolve(root, "apps/web"),
        env: webEnvironment,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    ),
  });
} catch (error) {
  stopProcesses();
  throw error;
}

process.stdout.write("Hono routes share this origin under /api (health: /api/v1/health, docs: /api/docs).\n");
process.stdout.write("Development uses an isolated local PGlite database; repository .env values are not loaded.\n");

const stopOnSignal = () => stopProcesses();
process.once("SIGINT", stopOnSignal);
process.once("SIGTERM", stopOnSignal);

const firstExit = await Promise.race(processes.map(async ({ name, child }) => ({ name, code: await child.exited })));
stopProcesses();
await Promise.all(processes.map(({ child }) => child.exited));
process.off("SIGINT", stopOnSignal);
process.off("SIGTERM", stopOnSignal);

if (firstExit.code !== 0) {
  process.stderr.write(
    `${firstExit.name} process exited with code ${firstExit.code}. Check whether its configured port is already in use.\n`,
  );
  process.exitCode = firstExit.code;
}

function stopProcesses(): void {
  for (const { child } of processes) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

function portFromEnvironment(name: string, fallback: number): number {
  const candidate = process.env[name];
  if (candidate === undefined) return fallback;
  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}

function pickSystemEnvironment(): Record<string, string> {
  const safeKeys = ["PATH", "HOME", "TMPDIR", "LANG", "TERM"] as const;
  return Object.fromEntries(safeKeys.flatMap((key) => (process.env[key] ? [[key, process.env[key] as string]] : [])));
}

async function readExampleEnvironment(): Promise<Record<string, string>> {
  const source = await Bun.file(resolve(root, ".env.example")).text();
  const environment: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1];
    let value = match[2]?.trim() ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) environment[key] = value;
  }
  return environment;
}

function createLocalAuthSecret(): string {
  return [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].join("");
}
