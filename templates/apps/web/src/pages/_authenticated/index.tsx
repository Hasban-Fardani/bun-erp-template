import { createFileRoute } from "@tanstack/react-router";
import { OverviewScreen } from "../../features/overview/screens/overview.tsx";

export const Route = createFileRoute("/_authenticated/")({ component: OverviewScreen });
