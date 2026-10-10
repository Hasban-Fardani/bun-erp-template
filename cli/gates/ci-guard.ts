/** CI is part of the template contract: removing a job must fail locally too. */
export async function checkCi(root: string): Promise<string[]> {
  const workflow = Bun.file(`${root}/.github/workflows/ci.yml`);
  if (!(await workflow.exists())) return ["CI workflow is missing"];
  const body = await workflow.text();
  const setup = await Bun.file(`${root}/.github/actions/setup/action.yml`)
    .text()
    .catch(() => "");
  const required = ["bun loom check", "bun loom test", "bun run qa", "test-postgres:", "postgres:", "ci-ok:"];
  const findings = required.filter((item) => !body.includes(item)).map((item) => `CI is missing ${item}`);
  // The template ships apps/ empty, so CI must install a combination before lint/check/test.
  const initCommand = "bun loom init --apps server,web --yes";
  if (!body.includes(initCommand) && !setup.includes(initCommand)) {
    findings.push(`CI setup is missing ${initCommand}`);
  }
  if (!(await Bun.file(`${root}/docs/ci.md`).exists())) findings.push("docs/ci.md is missing");
  return findings;
}
