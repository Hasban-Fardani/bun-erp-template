import { createFileRoute } from "@tanstack/react-router";
import { UsersScreen } from "../../features/users/screens/users.tsx";

export const Route = createFileRoute("/_authenticated/users")({ component: UsersScreen });
