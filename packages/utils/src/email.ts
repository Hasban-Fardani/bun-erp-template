import * as z from "zod";

/** Shared email contract for forms and API payloads. Trim before validating and normalize once. */
export const emailAddressSchema = z
  .string()
  .trim()
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

export function isValidEmailAddress(value: string): boolean {
  return emailAddressSchema.safeParse(value).success;
}
