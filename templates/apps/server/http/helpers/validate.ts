import { uniqueSymbol, validator } from "hono-openapi";
import type * as z from "zod";
import { type AppEnv, factory } from "../factory.ts";
import { ApiError } from "./errors.ts";

export function validate<Target extends "query" | "json" | "param", Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  // AppEnv is pinned explicitly: left inferred, hono-openapi returns the base Env and the
  // middleware stops fitting the factory-typed route chain.
  const middleware = validator<Schema, Target, AppEnv, string>(target, schema, (result) => {
    if (!result.success) {
      throw new ApiError(
        "VALIDATION_FAILED",
        422,
        "Request validation failed",
        result.error.map((issue) => ({
          path:
            issue.path?.map((part) => (typeof part === "object" ? String(part.key) : String(part))).join(".") ||
            "(root)",
          message: issue.message,
        })),
      );
    }
  });
  // doc() already emits metadata from this schema; avoid duplicate parameters and body definitions.
  Reflect.deleteProperty(middleware, uniqueSymbol);
  return factory.createMiddleware(middleware);
}
