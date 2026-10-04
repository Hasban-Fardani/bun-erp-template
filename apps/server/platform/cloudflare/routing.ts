export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

export function requiresOrganizationId(path: string, method = "GET"): boolean {
  if (method === "OPTIONS") return false;
  if (["/api/v1/health", "/api/v1/ready", "/api/docs", "/api/openapi.json"].includes(path)) return false;
  return path !== "/api/v1/auth" && !path.startsWith("/api/v1/auth/");
}
