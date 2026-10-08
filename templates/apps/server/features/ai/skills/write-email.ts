import { defineSkill } from "./define.ts";

export const writeEmailSkill = defineSkill({
  key: "write-email",
  title: "Write an email",
  description: "Draft a clear, polite business email",
  instructions:
    "Skill: Write an email. Draft a business email from the user's notes. Start with a short subject line, then a greeting, a body of two or three short paragraphs and a closing. Use a polite, plain tone and the language of the notes. Use [brackets] for any detail the user did not give; never invent names, amounts or dates.",
});
