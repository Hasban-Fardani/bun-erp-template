import { resolve } from "node:path";
import { createDevelopmentEnvironment } from "../tools/development-environment.ts";

const root = resolve(import.meta.dir, "..");
const development = await createDevelopmentEnvironment();
const { apiPort, webPort, webUrl } = development;

await Bun.$`mkdir -p ${resolve(root, ".data")}`.quiet();

const processes: { name: string; child: Bun.Subprocess }[] = [];

try {
  processes.push({
    name: "API",
    child: Bun.spawn([process.execPath, "--no-env-file", "--watch", "server.ts", "--api-only", "--with-jobs"], {
      cwd: resolve(root, "apps/server"),
      env: development.server,
      detached: true,
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
        resolve(root, "apps/web/node_modules/vite/bin/vite.js"),
        "--host",
        "localhost",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        cwd: resolve(root, "apps/web"),
        env: development.web,
        detached: true,
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

process.stdout.write(`Web app: ${webUrl}\n`);
process.stdout.write(`Hono API: ${webUrl}/api (health: ${webUrl}/api/v1/health, docs: ${webUrl}/api/docs).\n`);
process.stdout.write(`Internal API listener: http://localhost:${apiPort}\n`);
process.stdout.write("Queue worker: enabled in the API process and sharing its local database connection.\n");
process.stdout.write("Database: PostgreSQL from .env. CLI commands use the same connection.\n");

let stopping = false;
const stopOnSignal = () => {
  stopping = true;
  stopProcesses();
};
process.once("SIGINT", stopOnSignal);
process.once("SIGTERM", stopOnSignal);

const firstExit = await Promise.race(processes.map(async ({ name, child }) => ({ name, code: await child.exited })));
stopProcesses();
await Promise.all(processes.map(({ child }) => child.exited));
process.off("SIGINT", stopOnSignal);
process.off("SIGTERM", stopOnSignal);

if (firstExit.code !== 0 && !stopping) {
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
