import { createFileRoute } from "@tanstack/react-router";
import { RolesScreen } from "../../features/admin/screens/roles.tsx";

export const Route = createFileRoute("/_authenticated/roles")({ component: RolesScreen });
