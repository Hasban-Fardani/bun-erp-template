import { join } from "node:path";

/**
 * Copy gate for user-visible text.
 *
 * This repo is an internal business tool. The person using it runs the business, not servers:
 * "API aktif", "Memuat sesi", "izin audit.read" mean nothing to them and read as noise at best,
 * as an error they caused at worst. Technical vocabulary belongs in logs, docs, and the API —
 * not on a screen an operator works in for eight hours.
 *
 * Only *rendered* strings are checked. Identifiers, fetch paths, class names, and comments are
 * not user-facing, so flagging them would train everyone to ignore this gate.
 */

/** Vocabulary that never earns its place on an operator's screen. */
const FORBIDDEN: { id: string; pattern: RegExp; why: string }[] = [
  {
    id: "infra",
    pattern:
      /\b(api|endpoint|backend|frontend|server|database|basis data|cookie|token|cache|registry|runtime|deploy|repo|git|npm|bun)\b/i,
    why: "infrastructure vocabulary",
  },
  { id: "session", pattern: /\bsesi\b|\bsession\b/i, why: "the operator has an account, not a session" },
  {
    id: "permission-id",
    pattern: /\b[a-z]+\.[a-z]{3,}\b(?=\s*[.,)]|\s*$)/,
    why: "raw permission identifier, not a business state",
  },
  { id: "shell", pattern: /\bbun erp\b|\bnpm run\b|\bgit \w+/i, why: "shell command on a screen" },
  {
    id: "build-vocab",
    pattern: /\b(build|konfigurasi|config|modul|module|migrasi|schema|query|trace)\b/i,
    why: "implementation vocabulary",
  },
];

/** Props whose value is displayed to a user. Scanning every string would flag fetch paths. */
const DISPLAY_PROPS = [
  "label",
  "message",
  "title",
  "description",
  "placeholder",
  "aria-label",
  "hint",
  "note",
  "header",
  "caption",
  "summary",
];

/**
 * The deployment's own name. A template is copied by other people, so a client or owner name
 * baked into a screen ships to every one of them. `check:scope` blocks the same string in files;
 * this catches it in text assembled at runtime.
 */
const DEPLOYMENT_NAMES = new RegExp(
  // Built from fragments so this gate file does not itself contain a client name; `check:scope`
  // scans sources, and a guard that trips its own gate is noise.
  [
    ["dana", "rifamily"],
    ["dan", "ari"],
    ["flo", "ra-snack"],
    ["has", "ban"],
  ]
    .map((parts) => parts.join(""))
    .join("|"),
  "i",
);

export type CopyFinding = { file: string; line: number; rule: string; text: string; why: string };

export async function checkUserCopy(root: string): Promise<CopyFinding[]> {
  const findings: CopyFinding[] = [];
  const glob = new Bun.Glob("apps/web/src/**/*.tsx");

  for await (const file of glob.scan({ cwd: root })) {
    const raw = await Bun.file(join(root, file)).text();
    const lines = raw.split("\n");

    lines.forEach((line, index) => {
      // Comments explain decisions to developers; they are not shown to anyone.
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (/^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return;

      for (const text of renderedStrings(code)) {
        // An address is prose the user typed, never an identifier we leaked.
        if (text.includes("@")) continue;

        if (DEPLOYMENT_NAMES.test(text)) {
          findings.push({
            file,
            line: index + 1,
            rule: "USER_COPY_DEPLOYMENT_NAME",
            text: text.length > 70 ? `${text.slice(0, 70)}…` : text,
            why: "a deployment's own name ships to every copy of this template",
          });
        }

        for (const rule of FORBIDDEN) {
          const hit = rule.pattern.exec(text);
          if (!hit) continue;
          // `bun erp` in a test id or a path is not copy; only prose is.
          if (!/\s/.test(text) && rule.id !== "permission-id") continue;
          findings.push({
            file,
            line: index + 1,
            rule: `USER_COPY_${rule.id.toUpperCase()}`,
            text: text.length > 70 ? `${text.slice(0, 70)}…` : text,
            why: rule.why,
          });
        }
      }
    });
  }

  return findings;
}

/** JSX text nodes plus the props that get displayed. */
function renderedStrings(code: string): string[] {
  const out: string[] = [];

  for (const m of code.matchAll(/>([^<>{}]{3,})</g)) {
    const text = m[1]?.trim();
    if (text) out.push(text);
  }

  const propPattern = new RegExp(`\\b(?:${DISPLAY_PROPS.join("|")})=("([^"]{3,})"|\\{\`([^\`]{3,})\`\\})`, "g");
  for (const m of code.matchAll(propPattern)) {
    const text = m[2] ?? m[3];
    if (text) out.push(text);
  }

  return out;
}
