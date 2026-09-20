import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * F1.13 — skills gate. Setiap skill harus punya frontmatter yang bisa dibaca agent:
 * `name` + `description` dengan pemicu jelas. Skill tanpa pemicu = tidak akan termuat.
 */
export type SkillFinding = { file: string; message: string };

export async function validateSkills(dir: string): Promise<SkillFinding[]> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return [];
  }

  const findings: SkillFinding[] = [];

  for (const name of names) {
    const path = join(dir, name);
    if (!(await stat(path)).isDirectory()) continue;

    const skillFile = join(path, "SKILL.md");
    if (!(await Bun.file(skillFile).exists())) {
      findings.push({ file: name, message: "missing SKILL.md" });
      continue;
    }

    const body = await Bun.file(skillFile).text();
    const fm = /^---\n([\s\S]*?)\n---/.exec(body);
    if (!fm?.[1]) {
      findings.push({ file: name, message: "missing YAML frontmatter" });
      continue;
    }

    const nameLine = /^name:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();
    const descLine = /^description:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();

    if (!nameLine) findings.push({ file: name, message: "frontmatter missing `name`" });
    else if (nameLine !== name)
      findings.push({ file: name, message: `frontmatter name "${nameLine}" != directory "${name}"` });
    if (!descLine) findings.push({ file: name, message: "frontmatter missing `description`" });
    else if (!/^use when\b/i.test(descLine)) {
      findings.push({ file: name, message: 'description must start with a trigger, e.g. "Use when ..."' });
    }

    const bodyChars = body.replace(/^---[\s\S]*?---/, "").trim().length;
    if (bodyChars < 200) findings.push({ file: name, message: "body is too thin to be useful (<200 chars)" });
  }

  return findings;
}
