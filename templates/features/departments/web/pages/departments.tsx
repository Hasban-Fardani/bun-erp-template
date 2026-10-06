import { createFileRoute } from "@tanstack/react-router";
import { DepartmentsScreen } from "../../features/departments/screens/departments.tsx";

export const Route = createFileRoute("/_authenticated/departments")({ component: DepartmentsScreen });
