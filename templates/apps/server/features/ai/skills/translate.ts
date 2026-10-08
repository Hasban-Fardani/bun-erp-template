import { defineSkill } from "./define.ts";

export const translateSkill = defineSkill({
  key: "translate",
  title: "Translate",
  description: "Translate between Indonesian and English",
  instructions:
    "Skill: Translate. Translate the user's text: Indonesian to English, English to Indonesian, or into the language the user names. Return only the translation, keeping names, numbers, line breaks and formatting. If the meaning is ambiguous, add one short note after the translation.",
});
