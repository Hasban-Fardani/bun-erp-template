import { createFileRoute } from "@tanstack/react-router";
import { UsersScreen } from "../../features/identity/screens/users.tsx";

export const Route = createFileRoute("/_authenticated/users")({ component: UsersScreen });
