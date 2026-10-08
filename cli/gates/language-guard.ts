import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";
import { fileIndex } from "../lib/file-index.ts";

const INDONESIAN_TECHNICAL_WORDS = new Set([
  "kertas",
  "tinta",
  "tenang",
  "gelap",
  "terang",
  "pengguna",
  "peran",
  "tema",
  "warna",
  "ubah",
  "tambah",
  "hapus",
  "simpan",
  "batal",
  "berhasil",
  "gagal",
  "sandi",
  "pencarian",
  "cari",
  "muat",
  "kosong",
  "menunggu",
  "selesai",
  "aktif",
  "nonaktif",
  "rincian",
]);

const ENUM_PROPERTIES = new Set(["theme", "themes", "mode", "modes", "variant", "variants", "locale", "locales"]);
const THEME_VARIABLES = /^(theme|themes|themeOptions|themeValues|modes|variants)$/i;
const JSX_PRECEDERS = new Set(["=", "=>", "return", "(", "{", "[", ",", ":", "?", "&&", "||", "default"]);

export type LanguageFinding = { file: string; term: string; location: string };
type Token = { kind: SyntaxKind; text: string; value: string; start: number; end: number };

/** Finds Indonesian identifiers and technical enum values while ignoring JSX copy. */
export function checkTechnicalLanguageSource(source: string, file: string): LanguageFinding[] {
  const tokens = scanCode(source, file.endsWith(".tsx"));
  const findings: LanguageFinding[] = [];
  const reported = new Set<string>();
  const report = (value: string, location: string) => {
    for (const term of terms(value)) {
      if (!INDONESIAN_TECHNICAL_WORDS.has(term)) continue;
      const key = `${location}:${term}`;
      if (reported.has(key)) continue;
      reported.add(key);
      findings.push({ file, term, location });
    }
  };

  for (const token of tokens) {
    if (token.kind === SyntaxKind.Identifier) report(token.value, "identifier");
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== SyntaxKind.StringLiteral) continue;
    const value = token.value;
    if (isTypeUnionValue(tokens, index)) report(value, "type value");
    if (isTechnicalPropertyValue(tokens, index)) report(value, "technical config value");
    if (isTechnicalVariableValue(tokens, index)) report(value, "technical config value");
    if (isZodEnumValue(tokens, index)) report(value, "enum value");
  }

  return findings;
}

export async function checkTechnicalLanguage(root: string): Promise<LanguageFinding[]> {
  const findings: LanguageFinding[] = [];
  const index = fileIndex(root);
  // Email and PDF packages are pinned upstream templates; their registry provenance gates cover
  // origin and licensing, while this first-party naming rule stays focused on application code.
  // templates/apps holds the mobile catalog copy, which is first-party and must stay English-named.
  // templates/features holds first-party catalog features, checked before they are installed.
  const scanned = await Promise.all(
    ["apps", "packages/ui", "packages/utils", "templates/apps", "templates/features", "cli"].map((dir) =>
      index.files(`${dir}/**/*.{ts,tsx}`),
    ),
  );
  const files = scanned.flat().filter(
    (file) =>
      !file.endsWith("/routeTree.gen.ts") &&
      !file.includes("/node_modules/") &&
      // Gates lived outside this scan before moving under cli/; the TypeScript scanner desyncs
      // on the vendored governance and contrast sources, and gate code names are not user-facing.
      !file.startsWith("cli/gates/"),
  );

  for (const file of files) {
    const source = await index.text(file);
    findings.push(...checkTechnicalLanguageSource(source, file));
  }
  return findings;
}

function scanCode(source: string, isTsx: boolean): Token[] {
  const scanner = createScanner(true, isTsx ? LanguageVariant.JSX : LanguageVariant.Standard, source);
  const tokens: Token[] = [];
  let mode: "code" | "jsx-tag" | "jsx-text" = "code";
  let expressionDepth = 0;
  let expressionReturnMode: "jsx-tag" | "jsx-text" = "jsx-text";
  let tagDepth = 0;
  let closingTag = false;
  let selfClosingTag = false;
  let previous: Token | undefined;
  const templateFrames: { braceDepth: number }[] = [];

  while (true) {
    let kind = mode === "jsx-text" ? scanner.scanJsxToken() : scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    // A slash that cannot continue an expression starts a regular expression literal; without the
    // rescan its body is scanned as code and a "#" inside it stalls the scanner.
    if (
      mode === "code" &&
      (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) &&
      !endsExpression(previous)
    ) {
      kind = scanner.reScanSlashToken();
    }

    if (mode === "jsx-text") {
      if (kind === SyntaxKind.JsxText) continue;
      if (kind === SyntaxKind.OpenBraceToken) {
        mode = "code";
        expressionDepth = 1;
        expressionReturnMode = "jsx-text";
        continue;
      }
      if (kind === SyntaxKind.LessThanToken || kind === SyntaxKind.LessThanSlashToken) {
        mode = "jsx-tag";
        closingTag = kind === SyntaxKind.LessThanSlashToken;
        selfClosingTag = false;
        continue;
      }
      continue;
    }

    const token: Token = {
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
    };

    if (kind === SyntaxKind.TemplateHead) templateFrames.push({ braceDepth: 0 });
    if (kind === SyntaxKind.TemplateTail) templateFrames.pop();
    if (kind === SyntaxKind.OpenBraceToken && templateFrames.length > 0) {
      const frame = templateFrames.at(-1);
      if (frame) frame.braceDepth += 1;
    }
    if (kind === SyntaxKind.CloseBraceToken && templateFrames.length > 0) {
      const frame = templateFrames.at(-1);
      if (frame && frame.braceDepth > 0) frame.braceDepth -= 1;
      else {
        const templateKind = scanner.reScanTemplateToken(false);
        if (templateKind === SyntaxKind.TemplateTail) templateFrames.pop();
        if (templateKind === SyntaxKind.TemplateMiddle && frame) frame.braceDepth = 0;
        continue;
      }
    }

    if (mode === "jsx-tag") {
      if (kind === SyntaxKind.OpenBraceToken) {
        mode = "code";
        expressionDepth = 1;
        expressionReturnMode = "jsx-tag";
        continue;
      }
      if (kind === SyntaxKind.SlashToken) selfClosingTag = true;
      if (kind === SyntaxKind.GreaterThanToken) {
        if (closingTag) tagDepth = Math.max(0, tagDepth - 1);
        else if (!selfClosingTag) tagDepth += 1;
        mode = tagDepth > 0 ? "jsx-text" : "code";
        previous = token;
        continue;
      }
      if (kind === SyntaxKind.Identifier) tokens.push(token);
      previous = token;
      continue;
    }

    if (expressionDepth > 0) {
      if (kind === SyntaxKind.OpenBraceToken) expressionDepth += 1;
      if (kind === SyntaxKind.CloseBraceToken) {
        expressionDepth -= 1;
        if (expressionDepth === 0) {
          mode = expressionReturnMode;
          previous = token;
          continue;
        }
      }
    }

    if (
      isTsx &&
      kind === SyntaxKind.LessThanToken &&
      previous &&
      JSX_PRECEDERS.has(previous.text) &&
      /^[A-Za-z_$>]/.test(source.slice(token.end, token.end + 1))
    ) {
      mode = "jsx-tag";
      closingTag = false;
      selfClosingTag = false;
      previous = token;
      continue;
    }

    tokens.push(token);
    previous = token;
  }

  return tokens;
}

const EXPRESSION_END_KINDS = new Set<SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
]);

function endsExpression(token: Token | undefined): boolean {
  return token !== undefined && EXPRESSION_END_KINDS.has(token.kind);
}

function isTypeUnionValue(tokens: Token[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const current = tokens[cursor];
    if (!current) continue;
    if (current.text === ";" || current.text === "}") return false;
    if (
      current.kind === SyntaxKind.EqualsToken &&
      tokens[cursor - 1]?.kind === SyntaxKind.Identifier &&
      tokens[cursor - 2]?.kind === SyntaxKind.TypeKeyword
    ) {
      return true;
    }
  }
  return false;
}

function isTechnicalPropertyValue(tokens: Token[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 1 && cursor >= index - 32; cursor -= 1) {
    const current = tokens[cursor];
    if (!current) continue;
    if (current.text === ";" || current.text === "}") return false;
    if (current.kind === SyntaxKind.ColonToken) {
      const name = tokens[cursor - 1]?.value;
      return name !== undefined && ENUM_PROPERTIES.has(name);
    }
  }
  return false;
}

function isTechnicalVariableValue(tokens: Token[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 2 && cursor >= index - 32; cursor -= 1) {
    const current = tokens[cursor];
    if (!current) continue;
    if (current.text === ";" || current.text === "}") return false;
    if (
      current.kind === SyntaxKind.ConstKeyword ||
      current.kind === SyntaxKind.LetKeyword ||
      current.kind === SyntaxKind.VarKeyword
    ) {
      return THEME_VARIABLES.test(tokens[cursor + 1]?.value ?? "");
    }
  }
  return false;
}

function isZodEnumValue(tokens: Token[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0 && cursor >= index - 12; cursor -= 1) {
    const current = tokens[cursor];
    if (!current) continue;
    if (current.text === ";" || current.text === "}") return false;
    if (current.kind === SyntaxKind.Identifier && current.value === "enum") {
      return tokens[cursor + 1]?.kind === SyntaxKind.OpenParenToken;
    }
  }
  return false;
}

function terms(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
