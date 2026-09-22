import { describeRoute, resolver } from "hono-openapi";
import * as z from "zod";

/**
 * Documentation metadata rides on the route itself, not a separate file: adding a route
 * adds docs automatically, and no hand-written map can go stale. The `openapi-coverage`
 * test rejects a release when a route bypasses this helper.
 */

type DescribeRouteOptions = Parameters<typeof describeRoute>[0];

/** Error body shape from `http/app.ts`. Statuses here are not decoration — the client writes them. */
const ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "Request rusak / JSON tidak valid",
  "401": "Belum login (tidak ada sesi)",
  "403": "Login tapi izin kurang",
  "404": "Tidak ditemukan di organisasi ini",
  "409": "Konflik — data sudah dipakai",
  "422": "Validasi input gagal",
};

const envelope = (data: Record<string, unknown>) => ({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data,
    meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } },
  },
});

/**
 * Query params come from the real zod schema — constraints and defaults included, never retyped.
 * The library fills path params from the route pattern, so only query lives here.
 */
function queryParameters(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: "query" as const,
    required: (json.required ?? []).includes(name),
    schema: prop,
  }));
}

export function doc(spec: {
  summary: string;
  /** Permission enforced by `requirePermission`. `public: true` for endpoints without a session. */
  permission?: string;
  public?: boolean;
  tag?: string;
  body?: z.ZodType;
  query?: z.ZodType;
  data: Record<string, unknown>;
}) {
  /**
   * Public endpoints can only fail on input, never on identity: 401/403 there
   * are a false promise that makes clients write dead handlers.
   */
  const statuses = spec.public ? ["200", "400", "404", "422"] : Object.keys(ERROR_DESCRIPTIONS);

  const responses: Record<string, unknown> = {
    200: { description: "Sukses", content: { "application/json": { schema: envelope(spec.data) } } },
  };
  for (const status of statuses) {
    if (status === "200") continue;
    responses[status] = { description: ERROR_DESCRIPTIONS[status] };
  }

  return describeRoute({
    ...(spec.tag ? { tags: [spec.tag] } : {}),
    summary: spec.summary,
    // Enforced by the handler; listed here so a reviewer sees the permission without opening code.
    ...(spec.permission ? { "x-permission": spec.permission } : {}),
    security: spec.public ? [] : [{ cookieAuth: [] }],
    ...(spec.body
      ? { requestBody: { required: true, content: { "application/json": { schema: resolver(spec.body) } } } }
      : {}),
    ...(spec.query ? { parameters: queryParameters(spec.query) } : {}),
    responses,
  } as DescribeRouteOptions & { "x-permission"?: string });
}
