import { createFileRoute } from "@tanstack/react-router";
import { AuditScreen } from "../../features/audit/screens/audit.tsx";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditScreen });
