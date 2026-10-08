import { defineFeature } from "../../http/helpers/feature.ts";
import { storageRoutes } from "./route.ts";

/**
 * File serving mounts at /api/v1/files. The Cloudflare Worker only runs for /api and /api/*, so
 * the private file route lives under /api; STORAGE_PUBLIC_URL must point at this mount.
 */
export const storageFeature = defineFeature({ name: "storage", path: "files", routes: storageRoutes });
