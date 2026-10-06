import { createFactory } from "hono/factory";
import type { AppVariables } from "./helpers/types.ts";

/** One env type and one factory for the whole server: routes, middleware and helpers share them. */
export type AppEnv = { Variables: AppVariables };

export const factory = createFactory<AppEnv>();
