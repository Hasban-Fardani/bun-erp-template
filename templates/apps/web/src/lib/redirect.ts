/**
 * Login redirect targets arrive in the URL, so they are untrusted input. Only same-origin absolute
 * paths are accepted, and the login route itself is rejected so a preserved target cannot loop.
 */
export function safeRedirectTarget(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("\\")) return undefined;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login#")) return undefined;
  return value;
}
