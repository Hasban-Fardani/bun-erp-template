import type { HonoBase } from "hono/hono-base";
import type { MergePath, MergeSchemaPath, Schema } from "hono/types";
import type { AppContext } from "../../bootstrap/context.ts";
import type { AppEnv } from "../factory.ts";

/**
 * Feature mount prefix. `routes/api.ts` owns the public `API_PREFIX` contract (checked by the rpc
 * gate); this copy keeps the helpers independent from the route assembly that imports them.
 */
const API_PREFIX = "/api/v1";

/** Any router the app can mount; schema and paths stay generic so RPC inference survives. */
type AnyRouter = HonoBase<AppEnv, Schema, string, string>;

/** A feature declares its name and router; the app registers it explicitly so RPC types survive. */
export type FeatureDefinition<
  Name extends string = string,
  Router extends AnyRouter = AnyRouter,
  Path extends string | undefined = string | undefined,
> = {
  /** Feature identity, matching `apps/server/features/<name>/`. */
  name: Name;
  /** Mount segment under /api/v1 when it differs from the feature name (e.g. audit → audit-logs). */
  path?: Path;
  routes: (ctx: AppContext, fallbackOrganizationId: string) => Router;
};

export function defineFeature<
  const Name extends string,
  Router extends AnyRouter,
  const Path extends string | undefined = undefined,
>(definition: FeatureDefinition<Name, Router, Path>): FeatureDefinition<Name, Router, Path> {
  return definition;
}

type MountSegment<Name extends string, Path extends string | undefined> = Path extends string ? Path : Name;

/** The schema a feature router contributes once mounted at `Prefix/<segment>`. */
type FeatureSchema<Feature extends FeatureDefinition, Prefix extends string> =
  Feature extends FeatureDefinition<infer Name, infer Router, infer Path>
    ? Router extends HonoBase<AppEnv, infer FeatureSchema, infer _BasePath, infer _CurrentPath>
      ? MergeSchemaPath<FeatureSchema, MergePath<Prefix, MountSegment<Name, Path>>>
      : never
    : never;

/** Union of every feature schema, mirroring how Hono's own `route()` merges mounted schemas. */
type FeatureSchemas<Features extends readonly FeatureDefinition[], Prefix extends string> = {
  [Index in keyof Features]: FeatureSchema<Features[Index], Prefix>;
}[number];

/**
 * Mounts each feature under the versioned prefix. Registration still goes through `app.route()`,
 * and the return type folds every feature schema back into the app type, so `hc<AppType>` keeps
 * the full RPC contract even though the mounts happen in a loop.
 */
export function registerFeatures<
  const Features extends readonly FeatureDefinition[],
  S extends Schema,
  BasePath extends string,
  CurrentPath extends string,
>(
  app: HonoBase<AppEnv, S, BasePath, CurrentPath>,
  ctx: AppContext,
  organizationId: string,
  features: Features,
): HonoBase<AppEnv, S | FeatureSchemas<Features, typeof API_PREFIX>, BasePath, CurrentPath> {
  for (const feature of features) {
    app.route(`${API_PREFIX}/${feature.path ?? feature.name}`, feature.routes(ctx, organizationId));
  }
  return app;
}
