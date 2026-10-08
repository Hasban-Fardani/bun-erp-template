import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "../features/identity/screens/reset-password.tsx";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordScreen,
});
