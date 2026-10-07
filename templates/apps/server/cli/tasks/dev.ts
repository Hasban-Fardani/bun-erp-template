import { resolve } from "node:path";
import { createDevelopmentEnvironment, type DevelopmentEnvironment } from "../lib/development-environment.ts";

/** The slice of `Bun.spawn` the orchestrator uses; tests inject their own to avoid Vite. */
export type DevChild = {
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  kill(signal?: number | string): void;
  readonly stdout: ReadableStream<Uint8Array> | undefined;
  readonly stderr: ReadableStream<Uint8Array> | undefined;
};

export type DevSpawnOptions = {
  cwd: string;
  env: Record<string, string>;
  detached: boolean;
  stdin: "inherit";
  stdout: "pipe" | "inherit";
  stderr: "pipe" | "inherit";
};

export type DevSpawn = (command: string[], options: DevSpawnOptions) => DevChild;

export type DevRunOptions = {
  root: string;
  development: DevelopmentEnvironment;
  spawn?: DevSpawn;
  /** The API entry the watcher runs; tests point it at a fixture that fails at boot. */
  apiEntry?: string;
  probe?: (url: string) => Promise<boolean>;
  livenessIntervalMs?: number;
};

const READY_POLL_MS = 250;
const LIVENESS_INTERVAL_MS = 5_000;
const LIVENESS_FAILURES = 3;
/** `bun --watch` survives its script's SIGTERM handler, so a stuck child is killed after this. */
const STOP_GRACE_MS = 2_000;

type ManagedProcess = { name: string; child: DevChild };
type ReadyOutcome = { kind: "ready" } | { kind: "stopped" } | { kind: "failed"; code: number; message: string };

/**
 * Dev orchestration with fail-fast ordering: the API must answer `/api/v1/ready` before Vite
 * starts, and a boot crash stops the whole stack instead of leaving a dead API behind a live web
 * page. `--watch` keeps the API process alive after a crash, so readiness and the structured
 * `boot.failed` line are the signals — the exit code alone never arrives.
 */
export async function runDev(options: DevRunOptions): Promise<number> {
  const { root, development } = options;
  const spawn: DevSpawn = options.spawn ?? ((command, spawnOptions) => Bun.spawn(command, spawnOptions));
  const probe = options.probe ?? probeReady;
  const livenessIntervalMs = options.livenessIntervalMs ?? LIVENESS_INTERVAL_MS;
  const webDir = resolve(root, "apps/web");
  const hasWeb = await Bun.file(resolve(webDir, "package.json")).exists();

  const children: ManagedProcess[] = [];
  let stopping = false;
  let releaseStop = (): void => {};
  const stopRequested = new Promise<void>((resolveStop) => {
    releaseStop = resolveStop;
  });
  const onSignal = (): void => {
    stopping = true;
    releaseStop();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const stopAll = async (): Promise<void> => {
    for (const { child } of children) if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.all(children.map(({ child }) => stopChild(child)));
  };

  try {
    const api = spawn(
      [
        process.execPath,
        "--no-env-file",
        "--watch",
        options.apiEntry ?? "bootstrap/server.ts",
        "--api-only",
        "--with-jobs",
      ],
      {
        cwd: resolve(root, "apps/server"),
        env: development.server,
        detached: true,
        stdin: "inherit",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    children.push({ name: "API", child: api });

    let bootFailure: string | undefined;
    const watchBoot = (line: string): void => {
      bootFailure ??= formatBootFailure(line);
    };
    void tee(api.stdout, process.stdout, watchBoot);
    void tee(api.stderr, process.stderr, watchBoot);

    const readyUrl = `http://localhost:${development.apiPort}/api/v1/ready`;
    const ready = await waitForReady(
      api,
      readyUrl,
      probe,
      development.readyTimeoutMs,
      () => stopping,
      () => bootFailure,
    );
    if (ready.kind === "failed") {
      process.stderr.write(`${ready.message}\n`);
      await stopAll();
      return ready.code;
    }
    if (ready.kind === "stopped") {
      await stopAll();
      return 0;
    }

    if (hasWeb) {
      children.push({
        name: "Web",
        child: spawn(
          [
            process.execPath,
            "--no-env-file",
            resolve(webDir, "node_modules/vite/bin/vite.js"),
            "--host",
            "localhost",
            "--port",
            String(development.webPort),
            "--strictPort",
          ],
          {
            cwd: webDir,
            env: development.web,
            detached: true,
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          },
        ),
      });
    }
    printEndpoints(hasWeb, development);

    return await watchLiveness({
      children,
      probe,
      readyUrl,
      intervalMs: livenessIntervalMs,
      isStopping: () => stopping,
      stopRequested,
      stopAll,
    });
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

/** Poll `/api/v1/ready` until 200, or bail out on a boot failure, an exit, or the timeout. */
async function waitForReady(
  api: DevChild,
  readyUrl: string,
  probe: (url: string) => Promise<boolean>,
  timeoutMs: number,
  isStopping: () => boolean,
  bootFailure: () => string | undefined,
): Promise<ReadyOutcome> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isStopping()) return { kind: "stopped" };
    const failure = bootFailure();
    if (failure !== undefined) {
      return { kind: "failed", code: 1, message: `API failed to boot; stopping before Vite starts.\n${failure}` };
    }
    if (api.exitCode !== null) {
      return {
        kind: "failed",
        code: api.exitCode === 0 ? 1 : api.exitCode,
        message: `API exited with code ${api.exitCode} before it became ready. Check its output above.`,
      };
    }
    if (await probe(readyUrl)) return { kind: "ready" };
    await Bun.sleep(READY_POLL_MS);
  }
  return { kind: "failed", code: 1, message: `API did not become ready within ${timeoutMs}ms (${readyUrl}).` };
}

type LivenessOptions = {
  children: ManagedProcess[];
  probe: (url: string) => Promise<boolean>;
  readyUrl: string;
  intervalMs: number;
  isStopping: () => boolean;
  stopRequested: Promise<void>;
  stopAll: () => Promise<void>;
};

/** After start, a crash loop must stop the web app too, not leave it serving against nothing. */
async function watchLiveness(options: LivenessOptions): Promise<number> {
  let failures = 0;
  while (!options.isStopping()) {
    const exited = await firstExit(options.children, options.intervalMs, options.stopRequested);
    if (options.isStopping()) break;
    if (exited !== undefined) {
      process.stderr.write(`${exited.name} process exited with code ${exited.code}; stopping the stack.\n`);
      await options.stopAll();
      return exited.code === 0 ? 0 : exited.code;
    }
    failures = (await options.probe(options.readyUrl)) ? 0 : failures + 1;
    if (failures >= LIVENESS_FAILURES) {
      process.stderr.write("API is down; stopping web\n");
      await options.stopAll();
      return 1;
    }
  }
  await options.stopAll();
  return 0;
}

async function firstExit(
  children: ManagedProcess[],
  intervalMs: number,
  stopRequested: Promise<void>,
): Promise<{ name: string; code: number } | undefined> {
  // A clearable timer, not Bun.sleep: a pending sleep would keep the process alive after a stop.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interval = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, intervalMs);
  });
  try {
    const winner = await Promise.race([
      ...children.map(async ({ name, child }) => ({ name, code: await child.exited })),
      interval.then(() => undefined),
      stopRequested.then(() => undefined),
    ]);
    return winner ?? undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Graceful SIGTERM first; the `--watch` wrapper is SIGKILLed when it outlives its script. */
async function stopChild(child: DevChild): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), STOP_GRACE_MS);
  });
  try {
    const graceful = await Promise.race([child.exited.then(() => true), grace]);
    if (graceful) return;
    child.kill("SIGKILL");
    await child.exited;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Tee a piped child stream to ours while scanning complete lines for the boot.failed event. */
async function tee(
  stream: ReadableStream<Uint8Array> | undefined,
  sink: Pick<typeof process.stdout, "write"> | Pick<typeof process.stderr, "write">,
  onLine: (line: string) => void,
): Promise<void> {
  if (stream === undefined) return;
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for await (const chunk of stream) {
      sink.write(chunk);
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
    if (pending.length > 0) onLine(pending);
  } catch {
    // A killed child cuts the stream; its exit path already reports the failure.
  }
}

/** Extract the human-readable part of the API's structured `boot.failed` event. */
function formatBootFailure(line: string): string | undefined {
  if (!line.includes("boot.failed")) return undefined;
  try {
    const event = JSON.parse(line) as { error?: string; hint?: string };
    const message = event.error ?? "unknown boot error";
    return event.hint === undefined ? message : `${message}\nHint: ${event.hint}`;
  } catch {
    return line.trim();
  }
}

async function probeReady(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
}

function printEndpoints(hasWeb: boolean, development: DevelopmentEnvironment): void {
  if (hasWeb) {
    process.stdout.write(`Web app: ${development.webUrl}\n`);
    process.stdout.write(
      `Hono API: ${development.webUrl}/api (health: ${development.webUrl}/api/v1/health, docs: ${development.webUrl}/api/docs).\n`,
    );
  } else {
    process.stdout.write(
      "apps/web is not installed; serving the API only. Run `bun erp init --apps server,web --yes` to add it.\n",
    );
  }
  process.stdout.write(`Internal API listener: http://localhost:${development.apiPort}\n`);
  process.stdout.write("Queue worker: enabled in the API process and sharing its local database connection.\n");
  process.stdout.write("Database: PostgreSQL from .env. CLI commands use the same connection.\n");
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "../../../..");
  const development = await createDevelopmentEnvironment();
  await Bun.$`mkdir -p ${resolve(root, ".data")}`.quiet();
  process.exitCode = await runDev({ root, development });
}
