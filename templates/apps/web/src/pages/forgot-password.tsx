import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordScreen } from "../features/identity/screens/forgot-password.tsx";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordScreen });
