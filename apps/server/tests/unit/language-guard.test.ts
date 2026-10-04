import { expect, test } from "bun:test";
import { checkTechnicalLanguageSource } from "../../../../tools/language-guard.ts";

test("rejects Indonesian identifiers and technical theme values", () => {
  const findings = checkTechnicalLanguageSource(
    'type Theme = "kertas-tenang" | "dark"; const temaPengguna = "dark"; const options = { theme: "tinta-gelap" };',
    "fixture.ts",
  );

  expect(findings.map(({ term }) => term)).toContain("kertas");
  expect(findings.map(({ term }) => term)).toContain("pengguna");
  expect(findings.map(({ term }) => term)).toContain("tinta");
});

test("allows English technical values and Indonesian user-facing JSX copy", () => {
  const templateExpression = "$" + "{user.name}";
  const source = [
    'type Theme = "light" | "dark"; const themeOptions = ["light", "dark"];',
    `const message = \`Pencarian gagal: ${templateExpression}\`;`,
    'const Screen = () => <button aria-label="Tambah pengguna">Tambah pengguna</button>;',
  ].join(" ");
  const findings = checkTechnicalLanguageSource(source, "fixture.tsx");

  expect(findings).toEqual([]);
});

test("ignores Indonesian user-facing copy nested in JSX fragments", () => {
  const source = [
    "const Login = () => <form.Subscribe>",
    "{() => <>",
    "<label>Sandi</label>",
    "<button>Lupa sandi?</button>",
    "</>}",
    "</form.Subscribe>;",
  ].join(" ");

  expect(checkTechnicalLanguageSource(source, "fixture.tsx")).toEqual([]);
});
