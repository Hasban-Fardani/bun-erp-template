import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "../features/identity/screens/login.tsx";

export const Route = createFileRoute("/login")({ component: LoginScreen });
