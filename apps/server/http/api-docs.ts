import { describeRoute, resolver } from "hono-openapi";
import * as z from "zod";

/**
 * Documentation metadata rides on the route itself. A separate map of operations drifts from
 * the code; this cannot, and `openapi-coverage.test.ts` fails the build when a route skips it.
 */

type Operation = Parameters<typeof describeRoute>[0];

/** Failures any authenticated route can produce. Mirrors the error envelope in `http/app.ts`. */
const AUTHENTICATED_ERRORS: Readonly<Record<number, string>> = {
  400: "Malformed request body",
  401: "No session",
  403: "Authenticated, but the caller lacks the permission",
  404: "Not found in this organization",
  409: "Conflict — the value is already taken",
  422: "Input validation failed",
};

/** A public route has no identity to fail on, so 401/403 would be a promise clients cannot keep. */
const PUBLIC_ERRORS: Readonly<Record<number, string>> = {
  400: AUTHENTICATED_ERRORS[400] as string,
  404: AUTHENTICATED_ERRORS[404] as string,
  422: AUTHENTICATED_ERRORS[422] as string,
};

const ENVELOPE_META = {
  type: "object",
  required: ["requestId"],
  properties: { requestId: { type: "string" } },
};

function successResponse(data: Record<string, unknown>) {
  return {
    description: "Success",
    content: {
      "application/json": {
        schema: { type: "object", required: ["data", "meta"], properties: { data, meta: ENVELOPE_META } },
      },
    },
  };
}

function errorResponses(spec: DocSpec) {
  const table = spec.public ? PUBLIC_ERRORS : AUTHENTICATED_ERRORS;
  return Object.fromEntries(Object.entries(table).map(([status, description]) => [status, { description }]));
}

/**
 * Query parameters come from the real zod schema, constraints and defaults included, so the
 * document cannot describe a different query than the handler accepts. Path parameters are
 * filled in by the library from the route pattern.
 */
function queryParameters(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: "query" as const,
    required: required.has(name),
    schema: property,
  }));
}

type DocSpec = {
  summary: string;
  data: Record<string, unknown>;
  /** Permission the handler enforces, surfaced so a reviewer need not open the route. */
  permission?: string;
  /** Set only for routes reachable without a session. */
  public?: boolean;
  tag?: string;
  body?: z.ZodType;
  query?: z.ZodType;
};

export function doc(spec: DocSpec) {
  const operation = {
    responses: { 200: successResponse(spec.data), ...errorResponses(spec) },
    security: spec.public ? [] : [{ cookieAuth: [] }],
    summary: spec.summary,
  } as Operation & { "x-permission"?: string };

  if (spec.tag) operation.tags = [spec.tag];
  if (spec.permission) operation["x-permission"] = spec.permission;
  if (spec.body) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: resolver(spec.body) } },
    };
  }
  if (spec.query) operation.parameters = queryParameters(spec.query);

  return describeRoute(operation);
}
