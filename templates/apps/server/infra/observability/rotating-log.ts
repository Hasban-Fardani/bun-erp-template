import { appendFile, mkdir, readdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

/**
 * Rotating file destination for `LOG_DRIVER=daily`. VPS only: it uses the filesystem, so it must
 * never be reachable from the Cloudflare Worker graph (the Worker logger writes to stdout).
 *
 * Files are `<stem>-YYYY-MM-DD<ext>` (UTC day). When a file would pass `maxBytes` it is renamed to
 * `<stem>-YYYY-MM-DD.<n><ext>` and a fresh one starts. Files older than `retentionDays` are pruned.
 */
export type RotatingLogOptions = {
  /** `LOG_PATH`: its directory, stem and extension name the files. */
  path: string;
  retentionDays: number;
  maxBytes: number;
  now?: () => Date;
};

export type RotatingLogStream = {
  /** pino's destination contract: accepts a line and never throws. */
  write: (chunk: string) => boolean;
  flush: () => Promise<void>;
  end: () => Promise<void>;
};

const DAY_MS = 86_400_000;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createRotatingLogStream(options: RotatingLogOptions): RotatingLogStream {
  const now = options.now ?? (() => new Date());
  const directory = dirname(options.path);
  const extension = extname(options.path);
  const stem = basename(options.path, extension);
  const pattern = new RegExp(`^${escapeRegExp(stem)}-(\\d{4}-\\d{2}-\\d{2})(?:\\.\\d+)?${escapeRegExp(extension)}$`);

  let pending = "";
  let queue: Promise<void> = Promise.resolve();
  let scheduled = false;
  let activeDay = "";
  let activeSize = 0;
  let pruned = "";

  const fileFor = (day: string, index?: number) =>
    join(directory, `${stem}-${day}${index === undefined ? "" : `.${index}`}${extension}`);

  async function prune(today: string): Promise<void> {
    if (pruned === today) return;
    pruned = today;
    const oldest = dayNumber(today) - options.retentionDays + 1;
    for (const name of await readdir(directory)) {
      const day = pattern.exec(name)?.[1];
      if (day !== undefined && dayNumber(day) < oldest) await unlink(join(directory, name)).catch(() => {});
    }
  }

  async function rotateBySize(day: string): Promise<void> {
    let index = 1;
    while (await Bun.file(fileFor(day, index)).exists()) index += 1;
    await rename(fileFor(day), fileFor(day, index));
    activeSize = 0;
  }

  async function append(chunk: string): Promise<void> {
    const day = utcDay(now());
    if (day !== activeDay) {
      await mkdir(directory, { recursive: true });
      activeDay = day;
      const existing = Bun.file(fileFor(day));
      activeSize = (await existing.exists()) ? existing.size : 0;
      await prune(day);
    }
    const bytes = Buffer.byteLength(chunk);
    if (activeSize > 0 && activeSize + bytes > options.maxBytes) await rotateBySize(day);
    await appendFile(fileFor(day), chunk);
    activeSize += bytes;
  }

  function flush(): Promise<void> {
    scheduled = false;
    const chunk = pending;
    pending = "";
    if (chunk === "") return queue;
    // A failing disk must not crash the process or stall later writes: the chain always recovers.
    queue = queue.then(() => append(chunk)).catch(() => {});
    return queue;
  }

  return {
    write(line) {
      pending += line;
      if (!scheduled) {
        scheduled = true;
        setImmediate(() => void flush());
      }
      return true;
    },
    flush,
    async end() {
      await flush();
      await queue;
    },
  };
}
