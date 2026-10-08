import type { AiRequest } from "../types.ts";

/** Deterministic, offline answer for tests and keyless local work: it echoes the last question. */
export async function* streamFake(request: AiRequest) {
  const question = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const words = `(fake AI) You asked: ${question}`.split(/(?<= )/);
  for (const word of words) yield word;
}
