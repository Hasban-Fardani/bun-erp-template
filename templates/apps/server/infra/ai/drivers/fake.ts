import type { AiRequest, AiToolPlan, AiToolRequest } from "../types.ts";

/** Deterministic, offline answer for tests and keyless local work: it echoes the last question. */
export async function* streamFake(request: AiRequest) {
  const question = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const words = `(fake AI) You asked: ${question}`.split(/(?<= )/);
  for (const word of words) yield word;
}

const NOTIFICATION = /notifikasi|notification/i;
const FIND_USER = /(?:cari|find|search)\s+(?:user|users|pengguna)\s+(.+)/i;

/**
 * Deterministic tool planning for tests and keyless demos: a question about notifications calls
 * `unread_notifications`; "find user <text>" calls `find_users`. Anything else needs no tool.
 */
export function planFake(request: AiToolRequest): AiToolPlan {
  const question = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const offered = new Set(request.tools.map((tool) => tool.name));
  const search = FIND_USER.exec(question)?.[1]?.trim();
  if (search && offered.has("find_users")) {
    return { text: "", toolCalls: [{ id: "fake-call-1", name: "find_users", arguments: { query: search } }] };
  }
  if (NOTIFICATION.test(question) && offered.has("unread_notifications")) {
    return { text: "", toolCalls: [{ id: "fake-call-1", name: "unread_notifications", arguments: {} }] };
  }
  return { text: "", toolCalls: [] };
}
