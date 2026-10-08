import { defineSkill } from "./define.ts";

export const summarizeSkill = defineSkill({
  key: "summarize",
  title: "Summarize",
  description: "Condense pasted text into the key points",
  instructions:
    "Skill: Summarize. The user will paste or describe a text. Reply with a one-sentence gist, then at most five short bullet points with the facts, decisions, numbers and dates that matter. Keep the language of the text. Do not add information that is not in it.",
});
