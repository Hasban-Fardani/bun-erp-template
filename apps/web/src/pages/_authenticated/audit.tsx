import { createFileRoute } from "@tanstack/react-router";
import { AuditScreen } from "../../features/admin/screens/audit.tsx";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditScreen });
