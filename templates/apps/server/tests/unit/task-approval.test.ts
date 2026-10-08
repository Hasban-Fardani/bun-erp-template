import { afterAll, expect, test } from "bun:test";
import { checkTaskApproval } from "@cli/gates/task-approval.ts";

const roots: string[] = [];
const AI = "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>";

async function repo(): Promise<string> {
  const root = `/tmp/erp-approval-${crypto.randomUUID()}`;
  roots.push(root);
  await Bun.$`mkdir -p ${root}/docs/tasks && git -C ${root} init -q -b master`.quiet();
  return root;
}

async function commit(root: string, status: string, message: string, email = "dev@example.com", extra = "") {
  await Bun.write(`${root}/docs/tasks/T.md`, `---\nid: T\ntitle: T\nstatus: ${status}\n${extra}---\n`);
  await Bun.$`git -C ${root} add -A && git -C ${root} -c user.name=x -c user.email=${email} commit -q -m ${message}`.quiet();
}

afterAll(async () => {
  for (const root of roots) await Bun.$`rm -rf ${root}`.quiet();
});

test("outside a git repository the gate skips", async () => {
  expect(await checkTaskApproval(`/tmp/erp-nogit-${crypto.randomUUID()}`)).toEqual([]);
});

test("an agent commit that keeps in_progress passes", async () => {
  const root = await repo();
  await commit(root, "in_progress", `feat: task\n\n${AI}`);
  expect(await checkTaskApproval(root)).toEqual([]);
});

test("an agent commit raising status to done fails", async () => {
  const root = await repo();
  await commit(root, "in_progress", "feat: task");
  await commit(root, "done", `chore: finish\n\n${AI}`);
  expect((await checkTaskApproval(root)).join("\n")).toContain("docs/tasks/T.md");
});

test("an agent commit setting approved_by fails", async () => {
  const root = await repo();
  await commit(root, "in_progress", `chore: approve\n\n${AI}`, "dev@example.com", "approved_by: Ana\n");
  expect((await checkTaskApproval(root)).join("\n")).toContain("approved_by");
});

test("a human commit raising status passes", async () => {
  const root = await repo();
  await commit(root, "in_progress", "feat: task");
  await commit(root, "done", "chore: accept", "ana@example.com", "approved_by: Ana\n");
  expect(await checkTaskApproval(root)).toEqual([]);
});

test("AGENT_AUTHOR_EMAILS flags a commit without a trailer", async () => {
  const root = await repo();
  await commit(root, "in_progress", "feat: task");
  await commit(root, "ready", "chore: bump", "bot@example.com");
  expect(await checkTaskApproval(root, { env: { AGENT_AUTHOR_EMAILS: "bot@example.com" } })).not.toEqual([]);
  expect(await checkTaskApproval(root, { env: {} })).toEqual([]);
});

test("an uncommitted status raise is flagged until HUMAN_TASK_APPROVAL=1", async () => {
  const root = await repo();
  await commit(root, "in_progress", "feat: task");
  await Bun.write(`${root}/docs/tasks/T.md`, "---\nid: T\ntitle: T\nstatus: done\n---\n");
  expect((await checkTaskApproval(root, { env: {} })).join("\n")).toContain("uncommitted");
  expect(await checkTaskApproval(root, { env: { HUMAN_TASK_APPROVAL: "1" } })).toEqual([]);
});

test("history older than the base branch is out of range", async () => {
  const root = await repo();
  await commit(root, "done", `chore: old\n\n${AI}`);
  await Bun.$`git -C ${root} branch -q feature`.quiet();
  await Bun.$`git -C ${root} checkout -q feature`.quiet();
  await commit(root, "done", "chore: noop-ish", "dev@example.com", "evidence: x\n");
  expect(await checkTaskApproval(root, { env: {} })).toEqual([]);
});
