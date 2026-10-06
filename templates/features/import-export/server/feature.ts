import { defineFeature } from "../../http/helpers/feature.ts";
import { importExportRoutes } from "./route.ts";

/** Mounts at /api/v1/import-export. The export name follows the generator's `<camel>Feature` contract. */
export const importExportFeature = defineFeature({ name: "import-export", routes: importExportRoutes });
