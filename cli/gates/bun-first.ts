import { fileIndex } from "../lib/file-index.ts";

/**
 * Bun-first gate: the CLI, the server catalog, an installed `apps/server` and the shared packages use Bun's async APIs instead
 * of the Node built-ins Bun replaces. The problem is sync IO and repeated tree scans, not the
 * `node:` prefix itself, so the allowlist is explicit and documented in docs/conventions.md:
 *
 * - allowed: `node:path`, `node:url`, `node:os`, and `node:fs/promises` directory operations
 *   (`mkdir`, `rm`, `mkdtemp`, `stat`, `readdir`) — Bun has no equivalent and recommends these;
 * - banned: `node:child_process`; the sync `node:fs` readers/writers; `node:crypto`'s `randomUUID`
 *   and `createHash`; `node:util`'s `promisify`; and the `node-fetch`/`dotenv`/`glob`/`fast-glob`/
 *   `execa`/`cross-spawn` packages.
 *
 * Exempt: the vendored governance validators (they run in a Worker thread, so their sync IO never
 * blocks the gate loop), the Worker graph Phase 2 owns, and this gate itself (it names every banned
 * symbol). `templates/apps/web/**` is browser code and is not scanned.
 */

export type BunFirstFinding = { file: string; line: number; rule: string; detail: string };

const SCAN_GLOBS = [
  "cli/**/*.{ts,tsx}",
  "templates/apps/server/**/*.{ts,tsx}",
  "apps/server/**/*.{ts,tsx}",
  "packages/**/*.{ts,tsx}",
] as const;

const EXEMPT = [
  /^cli\/gates\/governance\//,
  /^cli\/gates\/bun-first\.ts$/,
  /^templates\/apps\/server\/bootstrap\/worker\.ts$/,
  /^templates\/apps\/server\/bootstrap\/cloudflare-/,
];

const BANNED_MODULES = new Map<string, string>([["node:child_process", "use Bun.spawn or Bun.$ instead"]]);

const BANNED_PACKAGES = new Map<string, string>([
  ["node-fetch", "Bun ships fetch"],
  ["dotenv", "Bun loads .env automatically"],
  ["glob", "use Bun.Glob"],
  ["fast-glob", "use Bun.Glob"],
  ["execa", "use Bun.spawn"],
  ["cross-spawn", "use Bun.spawn"],
]);

const SYNC_FS_NAMES = new Map<string, string>([
  ["readFileSync", "use Bun.file().text()"],
  ["writeFileSync", "use Bun.write()"],
  ["existsSync", "use Bun.file().exists()"],
  ["readdirSync", "use Bun.Glob().scan()"],
  ["statSync", "use Bun.file().lastModified or the async stat"],
]);

const NODE_CRYPTO_NAMES = new Map<string, string>([
  ["randomUUID", "use crypto.randomUUID()"],
  ["createHash", "use Bun.CryptoHasher"],
]);

const NODE_UTIL_NAMES = new Map<string, string>([["promisify", "Bun APIs are already async"]]);

const IMPORT_FROM = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/;
const SIDE_EFFECT_IMPORT = /^\s*import\s+["']([^"']+)["']/;
const REQUIRE = /(?:^|[^\w.])require\s*\(\s*["']([^"']+)["']\s*\)/;
const NAMED_IMPORTS = /\{([^}]*)\}/;

export async function checkBunFirst(root: string): Promise<string[]> {
  const index = fileIndex(root);
  const files = await index.files(SCAN_GLOBS);
  const findings: BunFirstFinding[] = [];
  for (const file of files) {
    if (EXEMPT.some((pattern) => pattern.test(file))) continue;
    findings.push(...scanSource(file, await index.text(file)));
  }
  return findings.map((f) => `${f.file}:${f.line} ${f.rule} — ${f.detail}`);
}

function scanSource(file: string, source: string): BunFirstFinding[] {
  const findings: BunFirstFinding[] = [];
  const lines = source.split("\n");
  const report = (line: number, rule: string, detail: string) => {
    findings.push({ file, line, rule, detail });
  };

  for (const [index, text] of lines.entries()) {
    const line = index + 1;
    const importMatch = IMPORT_FROM.exec(text);
    const module = importMatch?.[2] ?? SIDE_EFFECT_IMPORT.exec(text)?.[1] ?? REQUIRE.exec(text)?.[1];
    if (!module) continue;

    const bannedModule = BANNED_MODULES.get(module);
    if (bannedModule) {
      report(line, "BUN_FIRST_MODULE", `${module} is banned; ${bannedModule}`);
      continue;
    }
    const bannedPackage = [...BANNED_PACKAGES].find(([name]) => module === name || module.startsWith(`${name}/`));
    if (bannedPackage) {
      report(line, "BUN_FIRST_PACKAGE", `${bannedPackage[0]} is replaced by Bun; ${bannedPackage[1]}`);
      continue;
    }

    const names = importMatch ? namedImports(importMatch[1] ?? "") : [];
    if (module === "node:fs") {
      for (const name of names) {
        const replacement = SYNC_FS_NAMES.get(name);
        if (replacement) report(line, "BUN_FIRST_SYNC_FS", `${name} blocks the event loop; ${replacement}`);
      }
      // A namespace/default import hides the sync call behind `fs.`; flag the call site instead.
      if (names.length === 0) {
        for (const [usage, usageLine] of usages(lines, [...SYNC_FS_NAMES.keys()])) {
          report(usageLine, "BUN_FIRST_SYNC_FS", `${usage} blocks the event loop; ${SYNC_FS_NAMES.get(usage)}`);
        }
      }
      continue;
    }
    if (module === "node:crypto") {
      for (const name of names) {
        const replacement = NODE_CRYPTO_NAMES.get(name);
        if (replacement) report(line, "BUN_FIRST_NODE_CRYPTO", `${name} from node:crypto; ${replacement}`);
      }
      if (names.length === 0) {
        for (const [usage, usageLine] of usages(lines, [...NODE_CRYPTO_NAMES.keys()])) {
          report(usageLine, "BUN_FIRST_NODE_CRYPTO", `${usage} from node:crypto; ${NODE_CRYPTO_NAMES.get(usage)}`);
        }
      }
      continue;
    }
    if (module === "node:util") {
      for (const name of names) {
        const replacement = NODE_UTIL_NAMES.get(name);
        if (replacement) report(line, "BUN_FIRST_PROMISIFY", `${name} from node:util; ${replacement}`);
      }
      if (names.length === 0) {
        for (const [usage, usageLine] of usages(lines, [...NODE_UTIL_NAMES.keys()])) {
          report(usageLine, "BUN_FIRST_PROMISIFY", `${usage} from node:util; ${NODE_UTIL_NAMES.get(usage)}`);
        }
      }
    }
  }

  return findings;
}

/** `{ a, type b as c }` -> `["a", "c"]`. */
function namedImports(clause: string): string[] {
  const braces = NAMED_IMPORTS.exec(clause)?.[1];
  if (braces === undefined) return [];
  return braces
    .split(",")
    .map(
      (entry) =>
        entry
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .at(-1) ?? "",
    )
    .filter(Boolean);
}

function* usages(lines: readonly string[], names: readonly string[]): Generator<[string, number]> {
  const pattern = new RegExp(`\\b(${names.join("|")})\\s*\\(`);
  for (const [index, text] of lines.entries()) {
    const match = pattern.exec(text);
    if (match?.[1]) yield [match[1], index + 1];
  }
}
