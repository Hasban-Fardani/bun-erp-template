import type { Ai, AiMessage, AiToolPlan, AiToolRequest } from "@/infra/ai/index.ts";

export type SseEvent = { event: string; data: Record<string, unknown> };

/** Splits an SSE body into `{ event, data }` records. */
export async function events(response: { text(): Promise<string> }): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => ({
      event: /^event: (.*)$/m.exec(block)?.[1] ?? "message",
      data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}") as Record<string, unknown>,
    }));
}

/** The conversation id a chat stream announced, if history is on. */
export const conversationIdOf = (received: SseEvent[]) =>
  received.find((entry) => entry.event === "conversation")?.data.id as string;

/**
 * A provider that records what the model is shown (`seen`) and which tool plans were requested
 * (`planned`). It answers with fixed text; pass `plan` to script tool planning.
 */
export function recordingAi(
  answer = "Jawaban singkat.",
  plan?: (request: AiToolRequest) => AiToolPlan | Promise<AiToolPlan>,
): { ai: Ai; seen: AiMessage[][]; planned: AiToolRequest[] } {
  const seen: AiMessage[][] = [];
  const planned: AiToolRequest[] = [];
  const ai: Ai = {
    driver: "fake",
    model: "recording",
    available: true,
    async *stream(request) {
      seen.push([...request.messages]);
      yield answer;
    },
    complete: async () => "Ringkasan percakapan.",
    ...(plan
      ? {
          async plan(request: AiToolRequest) {
            planned.push(request);
            return plan(request);
          },
        }
      : {}),
  };
  return { ai, seen, planned };
}
