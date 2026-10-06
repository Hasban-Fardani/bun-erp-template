import { createFileRoute } from "@tanstack/react-router";
import { NotificationsScreen } from "../../features/notifications/screens/notifications.tsx";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsScreen });
