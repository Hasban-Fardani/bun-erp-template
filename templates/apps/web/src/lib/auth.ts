import { API_BASE } from "../config/env.ts";

/** Better Auth owns these endpoints; they do not expose an application RPC schema. */
export async function authRequest(path: "sign-in/email" | "sign-out" | "get-session", input?: unknown) {
  const response = await fetch(`${API_BASE}/api/v1/auth/${path}`, {
    method: path === "get-session" ? "GET" : "POST",
    credentials: "include",
    ...(input === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? "Permintaan gagal");
  return body;
}
