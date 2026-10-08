import { SyntaxKind } from "typescript/unstable/ast";
import type { createScanner } from "typescript/unstable/ast/scanner";

/**
 * Helpers for gates that walk TypeScript tokens with the bare scanner. The scanner does not know
 * where a regular expression literal starts, so a gate must rescan after a slash that cannot
 * continue an expression; otherwise a quote or `#` inside the regex body is scanned as code and can
 * stall or derail the scan.
 */
type Scanner = ReturnType<typeof createScanner>;

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

export function endsExpressionKind(kind: SyntaxKind | undefined): boolean {
  return kind !== undefined && EXPRESSION_END_KINDS.has(kind);
}

/** Turns a slash token that opens a regular expression into the whole literal; other kinds pass through. */
export function rescanRegex(scanner: Scanner, kind: SyntaxKind, previous: SyntaxKind | undefined): SyntaxKind {
  if ((kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) && !endsExpressionKind(previous)) {
    return scanner.reScanSlashToken();
  }
  return kind;
}
