import { join } from "node:path";

/**
 * F1.10 — scope gate. Menjaga agar repo template tidak berubah menjadi repo client:
 * nama client, aturan bisnis, atau direktori liar ditolak sebelum commit.
 */
type Scope = {
  allowed: { topLevelDirs: string[]; apps: string[] };
  forbidden: {
    paths: string[];
    patterns: { id: string; regex: string; flags?: string; reason: string; allowIn: string[] }[];
  };
};

export type ScopeFinding = { rule: string; path: string; detail: string };

const BINARY_OR_IGNORED = [
  /^node_modules\//,
  /^\.git\//,
  /^\.data\//,
  /^dist\//,
  /^bun\.lock$/,
  /\.tsbuildinfo$/,
  /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$/,
];

export async function loadScope(root: string): Promise<Scope> {
  return (await Bun.file(join(root, "template.scope.json")).json()) as Scope;
}

/** `**` cocok lintas direktori, `*` tidak. Ditulis manual supaya tidak menambah dependency glob. */
function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => {
    const pattern = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\/\*\*$/, "(/.*)?")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${pattern}$`).test(path);
  });
}

export async function checkScope(root: string): Promise<ScopeFinding[]> {
  const scope = await loadScope(root);
  const findings: ScopeFinding[] = [];
  const files = await gitFiles(root);

  for (const file of files) {
    if (BINARY_OR_IGNORED.some((re) => re.test(file))) continue;

    if (scope.forbidden.paths.includes(file)) {
      findings.push({ rule: "forbidden-path", path: file, detail: "must never be committed" });
    }

    const top = file.split("/")[0] ?? "";
    if (!file.includes("/")) continue;
    if (!scope.allowed.topLevelDirs.includes(top)) {
      findings.push({
        rule: "unknown-top-level",
        path: file,
        detail: `"${top}/" is not an allowed top-level directory`,
      });
    }

    let body = "";
    try {
      body = await Bun.file(join(root, file)).text();
    } catch {
      continue;
    }
    for (const pattern of scope.forbidden.patterns) {
      if (matchesAny(file, pattern.allowIn)) continue;
      const match = new RegExp(pattern.regex, pattern.flags ?? "").exec(body);
      if (match) {
        findings.push({ rule: pattern.id, path: file, detail: `"${match[0]}" — ${pattern.reason}` });
      }
    }
  }

  return findings;
}

/** Hanya file yang dilacak git — artefak build lokal bukan urusan scope. */
async function gitFiles(root: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\u0000")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .sort();
}
