import { defineFeature } from "../../http/helpers/feature.ts";
import { aiRoutes } from "./route.ts";

/** The built-in assistant mounts at /api/v1/ai. */
export const aiFeature = defineFeature({ name: "ai", routes: aiRoutes });
