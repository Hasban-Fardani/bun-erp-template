import { defineFeature } from "../../http/helpers/feature.ts";
import { rbacRoutes } from "./route.ts";

/** Role-based access control mounts at /api/v1/roles. */
export const rbacFeature = defineFeature({ name: "rbac", path: "roles", routes: rbacRoutes });
