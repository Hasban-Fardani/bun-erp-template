import * as z from "zod";
import * as auditSchema from "../modules/audit/schema.ts";
import * as deptSchema from "../modules/departments/schema.ts";
import * as identitySchema from "../modules/identity/schema.ts";
import { allPermissions, statements, systemRoles } from "../modules/rbac/statements.ts";
import type { Env } from "../platform/config/index.ts";

/**
 * Spesifikasi OpenAPI dibangun dari schema zod modul — bukan salinan manual.
 * Skema yang basi adalah lubang keamanan; yang dihasilkan dari kode tidak bisa basi.
 */

const envelope = (data: Record<string, unknown>) => ({
  type: "object",
  required: ["data", "meta"] as const,
  properties: {
    data,
    meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } },
  },
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const okEnvelope = (data: Record<string, unknown>, description = "Sukses") => ({
  description,
  content: { "application/json": { schema: envelope(data) } },
});

const jsonBody = (schemaRef: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schemaRef}` } } },
});

const tags = ["API v1"];

const protectedOp = (permission: string, summary: string, extras: Record<string, unknown> = {}) => ({
  tags,
  summary,
  description: `Butuh sesi (cookie) dan izin **${permission}**.`,
  security: [{ cookieAuth: [] }],
  ...extras,
});

const publicUser = {
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
};

const errors = {
  "400": errorResponse("Request rusak / JSON tidak valid"),
  "401": errorResponse("Belum login (tidak ada sesi)"),
  "403": errorResponse("Login tapi tidak punya izin yang disyaratkan"),
  "404": errorResponse("Sumber tidak ditemukan di organisasi ini"),
  "409": errorResponse("Konflik — email/kode sudah dipakai"),
  "422": errorResponse("Validasi input gagal (body/query di luar kontrak)"),
};

function usersPaths() {
  const listQuery = z.toJSONSchema(identitySchema.listUsersSchema, { unrepresentable: "any" }).properties ?? {};
  const listQueryParams = Object.entries(listQuery).map(([name, schema]) => ({
    name,
    in: "query",
    schema,
    required: !(
      (identitySchema.listUsersSchema as unknown as { shape: Record<string, { isOptional: () => boolean }> }).shape[
        name
      ]?.isOptional() ?? true
    ),
  }));

  return {
    "/api/v1/users": {
      get: protectedOp("user.read", "Daftar pengguna organisasi", {
        parameters: listQueryParams,
        responses: {
          "200": okEnvelope({
            type: "object",
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/PublicUser" } },
              total: { type: "integer" },
              limit: { type: "integer" },
              offset: { type: "integer" },
            },
          }),
          ...errors,
        },
      }),
      post: protectedOp("user.create", "Buat pengguna + sandi awal (admin invite tanpa server e-mail)", {
        requestBody: jsonBody("UserCreate"),
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/PublicUser" }), ...errors },
      }),
    },
    "/api/v1/users/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      get: protectedOp("user.read", "Detail satu pengguna", {
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/PublicUser" }), ...errors },
      }),
      patch: protectedOp("user.update", "Ubah profil pengguna (nama / organisasi / verifikasi email)", {
        requestBody: jsonBody("UserUpdate"),
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/PublicUser" }), ...errors },
      }),
      delete: protectedOp("user.delete", "Hapus pengguna (sesi & kredensial ikut terhapus; audit tetap)", {
        responses: { "200": okEnvelope({ type: "object", properties: { id: { type: "string" } } }), ...errors },
      }),
    },
    "/api/v1/users/{id}/roles": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      post: protectedOp("role.assign", "Tugaskan role ke pengguna", {
        requestBody: jsonBody("AssignRole"),
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/PublicUser" }), ...errors },
      }),
    },
    "/api/v1/users/{id}/roles/{roleKey}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        { name: "roleKey", in: "path", required: true, schema: { type: "string" } },
      ],
      delete: protectedOp("role.assign", "Cabut role dari pengguna", {
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/PublicUser" }), ...errors },
      }),
    },
  };
}

function catalogPaths() {
  return {
    "/api/v1/roles": {
      get: protectedOp("role.read", "Daftar role organisasi", {
        responses: {
          "200": okEnvelope({
            type: "object",
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/Role" } },
              total: { type: "integer" },
            },
          }),
          ...errors,
        },
      }),
    },
    "/api/v1/roles/statements": {
      get: protectedOp("role.read", "Katalog izin & role sistem (sumber = kode)", {
        responses: { "200": okEnvelope({ type: "object" }), ...errors },
      }),
    },
  };
}

function auditPaths() {
  return {
    "/api/v1/audit-logs": {
      get: protectedOp("audit.read", "Jejak audit (append-only)", {
        parameters: Object.entries(
          z.toJSONSchema(auditSchema.listAuditSchema, { unrepresentable: "any" }).properties ?? {},
        ).map(([name, schema]) => ({
          name,
          in: "query",
          schema,
        })),
        responses: {
          "200": okEnvelope({
            type: "object",
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } },
              total: { type: "integer" },
            },
          }),
          ...errors,
        },
      }),
    },
  };
}

function departmentPaths() {
  return {
    "/api/v1/departments": {
      get: protectedOp("department.read", "Daftar departemen", {
        parameters: Object.entries(
          z.toJSONSchema(deptSchema.listDepartmentsSchema, { unrepresentable: "any" }).properties ?? {},
        ).map(([name, schema]) => ({
          name,
          in: "query",
          schema,
        })),
        responses: {
          "200": okEnvelope({
            type: "object",
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/Department" } },
              total: { type: "integer" },
            },
          }),
          ...errors,
        },
      }),
      post: protectedOp("department.create", "Buat departemen", {
        requestBody: jsonBody("DepartmentCreate"),
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/Department" }), ...errors },
      }),
    },
    "/api/v1/departments/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      get: protectedOp("department.read", "Detail departemen", {
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/Department" }), ...errors },
      }),
      patch: protectedOp("department.update", "Ubah departemen", {
        requestBody: jsonBody("DepartmentUpdate"),
        responses: { "200": okEnvelope({ $ref: "#/components/schemas/Department" }), ...errors },
      }),
    },
  };
}

/** Dipakai `apps/server/http/app.ts`; UI review-nya tersedia di `/api/docs`. */
export function buildOpenApi(env: Env): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Bun ERP Template API",
      version: "1.0.0",
      description: [
        "REST API ERP (Hono). Semua respons dibungkus envelope `{data, meta.requestId}`.",
        "",
        "Autentikasi memakai cookie sesi Better Auth (`/api/v1/auth/*`): sign-up, sign-in, sign-out.",
        "401 = belum login, 403 = login tapi izin kurang. Katalog izin: `" + allPermissions.join("`, `") + "`.",
        "",
        `RBAC statements (sumber kebenaran = \`statements.ts\`): \`${JSON.stringify(statements)}\``,
      ].join("\n"),
    },
    servers: [{ url: env.APP_URL }],
    tags: [{ name: "API v1" }],
    paths: {
      ...usersPaths(),
      ...catalogPaths(),
      ...auditPaths(),
      ...departmentPaths(),
      "/api/v1/me": {
        get: protectedOp("—", "Identitas + izin sesi aktif (hanya butuh login)", {
          responses: {
            "200": okEnvelope({
              type: "object",
              properties: {
                userId: { type: "string" },
                organizationId: { type: ["string", "null"] },
                permissions: { type: "array", items: { type: "string" } },
              },
            }),
            ...errors,
          },
        }),
      },
      "/health": {
        get: { tags, summary: "Health check", responses: { "200": { description: "OK" } } },
      },
      "/ready": {
        get: { tags, summary: "Readiness (cek database)", responses: { "200": { description: "Ready" } } },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "meta"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", description: "Kode stabil, mis. UNAUTHORIZED / FORBIDDEN / VALIDATION_ERROR" },
                message: { type: "string" },
                fields: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  description: "Per-field saat VALIDATION_ERROR",
                },
              },
            },
            meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } },
          },
        },
        PublicUser: publicUser,
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
        UserCreate: z.toJSONSchema(identitySchema.createUserSchema, { io: "input", unrepresentable: "any" }),
        UserUpdate: z.toJSONSchema(identitySchema.updateUserSchema, { io: "input", unrepresentable: "any" }),
        AssignRole: z.toJSONSchema(identitySchema.assignRoleSchema, { io: "input", unrepresentable: "any" }),
        DepartmentCreate: z.toJSONSchema(deptSchema.createDepartmentSchema, { io: "input", unrepresentable: "any" }),
        DepartmentUpdate: z.toJSONSchema(deptSchema.updateDepartmentSchema, { io: "input", unrepresentable: "any" }),
        SystemRolesNote: { type: "object", description: `Role sistem bawaan: ${Object.keys(systemRoles).join(", ")}` },
      },
    },
  };
}
