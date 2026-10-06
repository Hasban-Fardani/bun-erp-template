import { defineFeature } from "../../http/helpers/feature.ts";
import { auditRoutes } from "./route.ts";

/** Audit log reads mount at /api/v1/audit-logs; the feature keeps its module name. */
export const auditFeature = defineFeature({ name: "audit", path: "audit-logs", routes: auditRoutes });
