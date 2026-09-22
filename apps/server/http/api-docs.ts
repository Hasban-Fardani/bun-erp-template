import { describeRoute, resolver } from "hono-openapi";
import * as z from "zod";

/**
 * Metadata dokumentasi menempel pada route-nya, bukan di berkas terpisah: menambah route
 * baru otomatis menambah dokumentasi, dan tak ada peta manual yang bisa basi. Test
 * `openapi-coverage` menolak rilis bila ada route yang belum lewat helper ini.
 */

type DescribeRouteOptions = Parameters<typeof describeRoute>[0];

/** Bentuk badan galat dari `http/app.ts`. Status di sini bukan hiasan — ia yang ditulis klien. */
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
 * Parameter query dari skema zod asli — batasan dan default ikut, tidak ditulis ulang.
 * Path param diisi library dari pola route, jadi di sini hanya query.
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
  /** Izin yang ditegakkan `requirePermission`. `public: true` untuk endpoint tanpa sesi. */
  permission?: string;
  public?: boolean;
  tag?: string;
  body?: z.ZodType;
  query?: z.ZodType;
  data: Record<string, unknown>;
}) {
  /**
   * Endpoint publik hanya bisa gagal karena input, bukan identitas: 401/403 di sana
   * adalah janji palsu yang membuat klien menulis penanganan mati.
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
    // Ditegakkan handler; ditulis di sini supaya reviewer melihat izinnya tanpa buka kode.
    ...(spec.permission ? { "x-permission": spec.permission } : {}),
    security: spec.public ? [] : [{ cookieAuth: [] }],
    ...(spec.body
      ? { requestBody: { required: true, content: { "application/json": { schema: resolver(spec.body) } } } }
      : {}),
    ...(spec.query ? { parameters: queryParameters(spec.query) } : {}),
    responses,
  } as DescribeRouteOptions & { "x-permission"?: string });
}
