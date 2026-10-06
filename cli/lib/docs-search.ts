import { resolve } from "node:path";

/**
 * Local-first documentation search. No network and no index to maintain: the corpus is the docs
 * tree, the package guides (`llms.txt`) and the feature READMEs, searched per query. The MCP
 * `docs-search` tool uses it so an agent can find the canonical document before reading files.
 */

export type DocsSearchHit = {
  path: string;
  score: number;
  line: number;
  snippet: string;
};

const CORPUS_GLOBS = [
  "docs/**/*.md",
  "packages/*/llms.txt",
  "templates/features/**/README.md",
  "apps/*/features/**/README.md",
];

async function corpusFiles(root: string): Promise<string[]> {
  const seen = new Set<string>();
  for (const pattern of CORPUS_GLOBS) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: root })) {
      if (!file.includes("node_modules")) seen.add(file);
    }
  }
  return [...seen].sort();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Ranks files by term frequency with a path and heading boost; ties break on path order. */
export async function searchDocs(root: string, query: string, limit = 10): Promise<DocsSearchHit[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];

  const hits: DocsSearchHit[] = [];
  for (const path of await corpusFiles(root)) {
    const body = await Bun.file(resolve(root, path)).text();
    const lower = body.toLowerCase();
    const lines = body.split("\n");
    const heading = (lines.find((line) => line.startsWith("#")) ?? "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      score += countOccurrences(lower, term);
      if (path.toLowerCase().includes(term)) score += 5;
      if (heading.includes(term)) score += 3;
    }
    if (score === 0) continue;
    const matching = lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term)));
    const line = matching < 0 ? 0 : matching + 1;
    const snippet = (lines[matching] ?? "").trim().slice(0, 160);
    hits.push({ path, score, line, snippet });
  }

  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, Math.max(1, limit));
}

/** One line per hit; used by the MCP `docs-search` tool. */
export function formatDocsSearch(hits: readonly DocsSearchHit[], query: string): string {
  if (hits.length === 0) return `No local document matches "${query}".`;
  return [`${hits.length} match(es) for "${query}"`, ""]
    .concat(hits.map((hit) => `${hit.path}:${hit.line}  score ${hit.score}  ${hit.snippet}`))
    .join("\n");
}
