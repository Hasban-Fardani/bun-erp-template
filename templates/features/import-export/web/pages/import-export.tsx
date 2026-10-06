import { createFileRoute } from "@tanstack/react-router";
import { ImportExportScreen } from "../../features/import-export/screens/import-export.tsx";

export const Route = createFileRoute("/_authenticated/import-export")({ component: ImportExportScreen });
