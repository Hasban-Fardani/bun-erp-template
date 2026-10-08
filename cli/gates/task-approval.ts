/**
 * Agents cannot raise task status. Reads git history of `docs/tasks/` and fails any commit that
 * sets `status: ready|done` or `approved_by:` while carrying an AI co-author trailer or an author
 * email listed in AGENT_AUTHOR_EMAILS, and any uncommitted change that does the same.
 *
 * Range: commits since the merge-base with the default branch; on the default branch itself the
 * last RECENT_COMMITS commits. Skips cleanly outside a git repository.
 */
export const AI_COAUTHOR_PATTERN =
  /^co-authored-by:.*(claude|anthropic|codex|openai|chatgpt|gpt|copilot|gemini|cursor|aider|devin|\[bot\])/im;

const RECENT_COMMITS = 50;
const DEFAULT_BRANCHES = ["origin/HEAD", "origin/master", "origin/main", "master", "main"];
const RAISES = /^\+(status:\s*(ready|done)\b|approved_by:\s*\S)/;

type Options = { env?: Record<string, string | undefined> };

async function git(root: string, ...args: string[]): Promise<{ ok: boolean; out: string }> {
  const result = await Bun.$`git -C ${root} ${args}`.quiet().nothrow();
  return { ok: result.exitCode === 0, out: result.stdout.toString() };
}

async function rangeArgs(root: string): Promise<string[]> {
  for (const branch of DEFAULT_BRANCHES) {
    const base = await git(root, "merge-base", branch, "HEAD");
    const head = await git(root, "rev-parse", "HEAD");
    const sha = base.out.trim();
    if (base.ok && sha && sha !== head.out.trim()) return [`${sha}..HEAD`];
  }
  return ["-n", String(RECENT_COMMITS)];
}

/** `{file, line}` for every added line in a unified diff that raises status or sets approval. */
function raisedLines(diff: string): string[] {
  const hits: string[] = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line.slice(4).replace(/^b\//, "");
    else if (RAISES.test(line) && file.startsWith("docs/tasks/")) hits.push(`${file} (${line.slice(1).trim()})`);
  }
  return hits;
}

export async function checkTaskApproval(root: string, options: Options = {}): Promise<string[]> {
  const env = options.env ?? process.env;
  const inside = await git(root, "rev-parse", "--is-inside-work-tree");
  if (!inside.ok || inside.out.trim() !== "true") return [];
  const findings: string[] = [];
  const agentEmails = (env.AGENT_AUTHOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const log = await git(
    root,
    "log",
    "-p",
    "-U0",
    "--no-merges",
    "--format=%x1e%H%x1f%ae%x1f%B%x1f",
    ...(await rangeArgs(root)),
    "--",
    "docs/tasks",
  );
  for (const chunk of log.out.split("\x1e").slice(1)) {
    const [sha = "", email = "", message = "", diff = ""] = chunk.split("\x1f");
    const agent = AI_COAUTHOR_PATTERN.test(message) || agentEmails.includes(email.trim().toLowerCase());
    if (!agent) continue;
    for (const hit of raisedLines(diff)) {
      findings.push(`${sha.slice(0, 9)} raised status/approval by an agent commit: ${hit} — only a human may do this`);
    }
  }

  if (env.HUMAN_TASK_APPROVAL !== "1") {
    const diff = await git(root, "diff", "HEAD", "-U0", "--", "docs/tasks");
    for (const hit of raisedLines(diff.out)) {
      findings.push(`uncommitted change raises status/approval: ${hit} — leave it at in_progress for a human`);
    }
    const untracked = await git(root, "ls-files", "--others", "--exclude-standard", "--", "docs/tasks");
    for (const file of untracked.out.split("\n").filter(Boolean)) {
      const text = await Bun.file(`${root}/${file}`).text();
      const added = text.split("\n").map((line) => `+${line}`);
      for (const hit of raisedLines(["+++ b/" + file, ...added].join("\n"))) {
        findings.push(`uncommitted change raises status/approval: ${hit} — leave it at in_progress for a human`);
      }
    }
  }
  return findings;
}
