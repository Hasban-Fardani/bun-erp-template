import { defineFeature } from "../../http/helpers/feature.ts";
import { notificationRoutes } from "./route.ts";

/** Notifications mount at /api/v1/notifications. */
export const notificationFeature = defineFeature({ name: "notifications", routes: notificationRoutes });
