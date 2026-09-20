import * as z from "zod";
import * as auditSchema from "../modules/audit/schema.ts";
import * as deptSchema from "../modules/departments/schema.ts";
import * as identitySchema from "../modules/identity/schema.ts";
import { allPermissions, statements, systemRoles } from "../modules/rbac/statements.ts";
import type { Env } from "../platform/config/index.ts";

/**
 * Kontrak API. Skema body/query DITURUNKAN dari zod modul, dan test `openapi-coverage`
 * menolak rilis bila ada route terdaftar yang belum punya entri di sini — dokumentasi
 * tak bisa basi tanpa membunyikan alarm.
 */

const json = (schema: Record<string, unknown>) => ({ "application/json": { schema } });

const envelope = (data: Record<string, unknown>) => ({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data,
    meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } },
  },
});

const ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "Request rusak / JSON tidak valid",
  "401": "Belum login (tidak ada sesi)",
  "403": "Login tapi izin kurang",
  "404": "Tidak ditemukan di organisasi ini",
  "409": "Konflik — email/kode sudah dipakai",
  "422": "Validasi input gagal",
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonSchema = (schema: z.ZodType, io: "input" | "output" = "input") =>
  z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;

const userRef = ref("PublicUser");

type OpSpec = {
  /** Izin yang ditegakkan; kosong = hanya butuh login, `null` = endpoint publik. */
  permission?: string | null;
  summary: string;
  requestBody?: string;
  data?: Record<string, unknown>;
  query?: z.ZodType;
  description?: string;
};

/** Kunci = `"METHOD /path"` memakai sintaks param Hono (`:id`). */
const ops: Record<string, OpSpec> = {
  "GET /api/v1/me": {
    permission: undefined,
    summary: "Identitas + izin sesi aktif",
    data: {
      type: "object",
      properties: {
        userId: { type: "string" },
        organizationId: { type: ["string", "null"] },
        permissions: { type: "array", items: { type: "string" } },
      },
    },
  },
  "GET /api/v1/users": {
    permission: "user.read",
    summary: "Daftar pengguna organisasi",
    query: identitySchema.listUsersSchema,
    data: {
      type: "object",
      properties: {
        items: { type: "array", items: userRef },
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
  },
  "POST /api/v1/users": {
    permission: "user.create",
    summary: "Buat pengguna + sandi awal (admin invite tanpa server e-mail)",
    requestBody: "UserCreate",
    data: userRef,
  },
  "GET /api/v1/users/:id": { permission: "user.read", summary: "Detail pengguna", data: userRef },
  "PATCH /api/v1/users/:id": {
    permission: "user.update",
    summary: "Ubah profil pengguna",
    requestBody: "UserUpdate",
    data: userRef,
  },
  "DELETE /api/v1/users/:id": {
    permission: "user.delete",
    summary: "Hapus pengguna (sesi & kredensial ikut; audit tetap)",
    data: { type: "object", properties: { id: { type: "string" } } },
  },
  "POST /api/v1/users/:id/roles": {
    permission: "role.assign",
    summary: "Tugaskan role ke pengguna",
    requestBody: "AssignRole",
    data: userRef,
  },
  "DELETE /api/v1/users/:id/roles/:roleKey": {
    permission: "role.assign",
    summary: "Cabut role dari pengguna",
    data: userRef,
  },
  "GET /api/v1/roles": {
    permission: "role.read",
    summary: "Daftar role organisasi",
    data: {
      type: "object",
      properties: { items: { type: "array", items: ref("Role") }, total: { type: "integer" } },
    },
  },
  "GET /api/v1/roles/statements": {
    permission: "role.read",
    summary: "Katalog izin & role sistem (sumber = kode)",
    data: { type: "object" },
  },
  "GET /api/v1/audit-logs": {
    permission: "audit.read",
    summary: "Jejak audit (append-only)",
    query: auditSchema.listAuditSchema,
    data: {
      type: "object",
      properties: {
        items: { type: "array", items: ref("AuditLog") },
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
  },
  "GET /api/v1/departments": {
    permission: "department.read",
    summary: "Daftar departemen",
    query: deptSchema.listDepartmentsSchema,
    data: {
      type: "object",
      properties: {
        items: { type: "array", items: ref("Department") },
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
  },
  "POST /api/v1/departments": {
    permission: "department.create",
    summary: "Buat departemen",
    requestBody: "DepartmentCreate",
    data: ref("Department"),
  },
  "GET /api/v1/departments/:id": {
    permission: "department.read",
    summary: "Detail departemen",
    data: ref("Department"),
  },
  "PATCH /api/v1/departments/:id": {
    permission: "department.update",
    summary: "Ubah departemen",
    requestBody: "DepartmentUpdate",
    data: ref("Department"),
  },
  "GET /health": { permission: null, summary: "Health check", data: { type: "object" } },
  "GET /ready": { permission: null, summary: "Readiness (cek database)", data: { type: "object" } },
};

const errorResponses = Object.fromEntries(
  Object.entries(ERROR_DESCRIPTIONS).map(([code, description]) => [code, { description, content: json(ref("Error")) }]),
);

const queryParameters = (schema: z.ZodType) => {
  const properties = (jsonSchema(schema).properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(properties).map(([name, s]) => ({ name, in: "query", schema: s }));
};

const pathParameters = (path: string) =>
  [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: name === "id" ? "uuid" : undefined },
  }));

function toOperation(spec: OpSpec, path: string) {
  const needsLogin = spec.permission !== null;
  return {
    summary: spec.summary,
    description:
      spec.permission === null
        ? "Endpoint publik."
        : spec.permission
          ? `Butuh sesi (cookie) dan izin **${spec.permission}**.`
          : "Butuh sesi (cookie); tanpa izin khusus.",
    ...(needsLogin ? { security: [{ cookieAuth: [] }] } : {}),
    parameters: [...pathParameters(path), ...(spec.query ? queryParameters(spec.query) : [])],
    ...(spec.requestBody ? { requestBody: { required: true, content: json(ref(spec.requestBody)) } } : {}),
    responses: {
      "200": {
        description: "Sukses",
        content: json(envelope(spec.data ?? { type: "object" })),
      },
      ...errorResponses,
    },
  };
}

const concretePath = (raw: string) => raw.replace(/:(\w+)/g, "{$1}");

export const documentedRoutes: readonly string[] = Object.keys(ops);

/** Dipakai `http/app.ts` dan test coverage; UI review di `/api/docs`. */
export function buildOpenApi(env: Env): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [key, spec] of Object.entries(ops)) {
    const space = key.indexOf(" ");
    const method = key.slice(0, space).toLowerCase();
    const rawPath = key.slice(space + 1);
    const path = concretePath(rawPath);
    paths[path] ??= {};
    paths[path][method] = toOperation(spec, rawPath);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Bun ERP Template API",
      version: "1.0.0",
      description: [
        "REST API ERP (Hono). Setiap respons dibungkus `{data, meta.requestId}`.",
        "",
        "Autentikasi memakai cookie sesi Better Auth (`/api/v1/auth/*`): sign-up, sign-in, sign-out.",
        "401 = belum login, 403 = login tapi izin kurang. Katalog izin: `" + allPermissions.join("`, `") + "`.",
        "",
        `RBAC statements: \`${JSON.stringify(statements)}\``,
        `Role sistem: \`${Object.keys(systemRoles).join("`, `")}\`.`,
      ].join("\n"),
    },
    servers: [{ url: env.APP_URL }],
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" } },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "meta"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", description: "Mis. UNAUTHORIZED / FORBIDDEN / VALIDATION_ERROR" },
                message: { type: "string" },
                fields: { type: "object", additionalProperties: { type: "string" } },
              },
            },
            meta: { type: "object", properties: { requestId: { type: "string" } } },
          },
        },
        PublicUser: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            emailVerified: { type: "boolean" },
            organizationId: { type: ["string", "null"], format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            roles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  roleId: { type: "string", format: "uuid" },
                  key: { type: "string" },
                  name: { type: "string" },
                  scopeType: { type: ["string", "null"], enum: ["organization", "department", null] },
                  scopeId: { type: ["string", "null"], format: "uuid" },
                },
              },
            },
            permissions: { type: "array", items: { type: "string" } },
          },
        },
        Role: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            key: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            isSystem: { type: "boolean" },
            organizationId: { type: "string", format: "uuid" },
          },
        },
        Department: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            organizationId: { type: "string", format: "uuid" },
            name: { type: "string" },
            code: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            organizationId: { type: ["string", "null"], format: "uuid" },
            actorId: { type: ["string", "null"], format: "uuid" },
            actorLabel: { type: "string" },
            event: { type: "string", description: "Format `domain.aksi_hasil`, mis. user.created" },
            subjectType: { type: "string" },
            subjectId: { type: "string" },
            before: { type: ["object", "null"], additionalProperties: true },
            after: { type: ["object", "null"], additionalProperties: true },
            traceId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        UserCreate: jsonSchema(identitySchema.createUserSchema),
        UserUpdate: jsonSchema(identitySchema.updateUserSchema),
        AssignRole: jsonSchema(identitySchema.assignRoleSchema),
        DepartmentCreate: jsonSchema(deptSchema.createDepartmentSchema),
        DepartmentUpdate: jsonSchema(deptSchema.updateDepartmentSchema),
      },
    },
  };
}
