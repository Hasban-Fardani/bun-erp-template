/** Keep the public API namespace isolated from the web app on every runtime. */
export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}
