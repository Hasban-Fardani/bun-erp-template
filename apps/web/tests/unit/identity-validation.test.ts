import { expect, test } from "bun:test";
import { isValidEmailAddress } from "@bun-erp/utils/email";
import { CreateUserInput } from "../../../server/features/identity/validation.ts";

test("the user form and API agree on malformed email addresses", () => {
  const email = "a@example..com";
  const acceptedByForm = isValidEmailAddress(email);
  const acceptedByApi = CreateUserInput.safeParse({
    name: "Example User",
    email,
    password: "StrongPass123",
    roleKey: "staff",
  }).success;

  expect(acceptedByForm).toBe(acceptedByApi);
  expect(acceptedByForm).toBe(false);
});

test("valid user emails are trimmed and normalized before creation", () => {
  const result = CreateUserInput.safeParse({
    name: "Example User",
    email: "  USER@EXAMPLE.COM  ",
    password: "StrongPass123",
    roleKey: "staff",
  });

  expect(isValidEmailAddress("  USER@EXAMPLE.COM  ")).toBe(true);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.email).toBe("user@example.com");
});
