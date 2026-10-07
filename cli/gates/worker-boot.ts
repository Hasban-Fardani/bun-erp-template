/**
 * Target-parity prerequisites for the Cloudflare Worker (`WORKER_BOOT=1`).
 *
 * The `worker` gate proves the bundle is safe (no Bun globals, no DDL, inside budget). This gate
 * proves the local environment can actually boot it: `wrangler` resolves, the Hyperdrive local
 * connection string is configured, and its PostgreSQL answers. It is deterministic and fast, so it
 * never blocks `check` unless asked for.
 *
 * The full boot is a manual, documented step because it starts Vite + workerd (about 30 s):
 *
 *   export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://…
 *   bun erp cloudflare:dev
 *   curl -s http://127.0.0.1:<workerd-port>/api/v1/health   # {"status":"ok"}
 *   curl -s http://127.0.0.1:<workerd-port>/api/v1/ready    # {"status":"ready",…}
 *
 * workerd binds an ephemeral port; `lsof -nP -iTCP -sTCP:LISTEN | grep workerd` lists it. The
 * recorded run of this command lives in `docs/deployment.md` ("Measured Worker budget").
 */
const HYPERDRIVE_VAR = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

async function readDevVars(root: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const path of [`${root}/apps/web/.dev.vars`, `${root}/.dev.vars`]) {
    const file = Bun.file(path);
    if (!(await file.exists())) continue;
    for (const line of (await file.text()).split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match?.[1] && match[2] !== undefined) vars[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return vars;
}

/** TCP reachability of a postgres:// URL; a Worker cannot boot without the database behind it. */
async function databaseReachable(url: string): Promise<boolean> {
  let host: string;
  let port: number;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = Number(parsed.port || "5432");
  } catch {
    return false;
  }
  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: { data: () => {}, open: () => {}, close: () => {}, error: () => {} },
    });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

export async function checkWorkerBoot(root: string): Promise<string[]> {
  if (process.env.WORKER_BOOT !== "1") {
    process.stdout.write(
      "worker-boot: skipped — set WORKER_BOOT=1 to verify the Cloudflare boot prerequisites (wrangler, Hyperdrive connection, reachable database).\n",
    );
    return [];
  }

  const findings: string[] = [];
  const wrangler = Bun.spawnSync(["bunx", "--bun", "wrangler", "--version"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (wrangler.exitCode !== 0) {
    findings.push("WORKER_BOOT_WRANGLER: wrangler is not resolvable; install it or unset WORKER_BOOT.");
  }

  const devVars = await readDevVars(root);
  const connection = process.env[HYPERDRIVE_VAR] ?? devVars[HYPERDRIVE_VAR] ?? "";
  if (connection === "") {
    findings.push(`WORKER_BOOT_HYPERDRIVE: ${HYPERDRIVE_VAR} is not set (export it or add it to apps/web/.dev.vars).`);
  } else if (!(await databaseReachable(connection))) {
    findings.push(
      `WORKER_BOOT_DATABASE: the Hyperdrive local connection is not reachable: ${connection.replace(/:[^:@]*@/, ":***@")}`,
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET ?? devVars.BETTER_AUTH_SECRET ?? "";
  if (secret === "") {
    findings.push("WORKER_BOOT_SECRET: BETTER_AUTH_SECRET is not set for the Worker dev session.");
  }

  if (findings.length === 0) {
    process.stdout.write(
      "worker-boot: prerequisites OK — boot it with `bun erp cloudflare:dev` and probe /api/v1/health + /api/v1/ready.\n",
    );
  }
  return findings;
}
