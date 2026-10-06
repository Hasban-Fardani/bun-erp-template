import { defineFeature } from "../../http/helpers/feature.ts";
import { departmentRoutes } from "./route.ts";

/** Departments mount at /api/v1/departments. The export name follows the generator's `<camel>Feature` contract. */
export const departmentsFeature = defineFeature({ name: "departments", routes: departmentRoutes });
