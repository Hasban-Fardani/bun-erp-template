/** CI is part of the template contract: removing a job must fail locally too. */
export async function checkCi(root: string): Promise<string[]> {
  const workflow = Bun.file(`${root}/.github/workflows/ci.yml`);
  if (!(await workflow.exists())) return ["CI workflow is missing"];
  const body = await workflow.text();
  const required = ["bun erp check", "bun erp test", "bun run qa", "test-postgres:", "postgres:", "ci-ok:"];
  const findings = required.filter((item) => !body.includes(item)).map((item) => `CI is missing ${item}`);
  if (!(await Bun.file(`${root}/docs/ci.md`).exists())) findings.push("docs/ci.md is missing");
  return findings;
}
