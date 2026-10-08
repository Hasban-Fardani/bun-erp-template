/**
 * The only >= 400 responses a QA run expects. Everything else keeps failing the run.
 *
 * - `GET /api/v1/me` -> 401: the anonymous session probe the app sends before it knows there is a session.
 * - `POST /api/v1/auth/sign-in/email` -> 401: the login suite signs in with a wrong password on purpose.
 */
const EXPECTED: ReadonlyArray<{ method: string; path: string; status: number }> = [
  { method: "GET", path: "/api/v1/me", status: 401 },
  { method: "POST", path: "/api/v1/auth/sign-in/email", status: 401 },
];

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function isExpectedResponse(response: { method: string; url: string; status: number }): boolean {
  const path = pathOf(response.url);
  return EXPECTED.some(
    (entry) =>
      entry.method === response.method.toUpperCase() && entry.path === path && entry.status === response.status,
  );
}

/**
 * Chromium logs "Failed to load resource" for every failed fetch. Such a message is expected only when
 * its location URL is an expected failing endpoint and the status in the text matches; the console
 * message carries no HTTP method, so the response check above is what pins the method.
 */
export function isExpectedConsoleError(message: { text: string; locationUrl: string }): boolean {
  if (!message.text.startsWith("Failed to load resource")) return false;
  const path = pathOf(message.locationUrl);
  return EXPECTED.some((entry) => entry.path === path && message.text.includes(`status of ${entry.status}`));
}
