import { defineFeature } from "../../http/helpers/feature.ts";
import { identityRoutes } from "./route.ts";

/** Identity (users, roles, sessions) mounts at /api/v1/users. */
export const identityFeature = defineFeature({ name: "identity", path: "users", routes: identityRoutes });
