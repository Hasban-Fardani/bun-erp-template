/** Escapes the three characters that can break out of HTML text content. Shared by mail and notification rendering. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
