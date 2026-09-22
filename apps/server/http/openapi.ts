import type { openAPIRouteHandler } from "hono-openapi";
import { allPermissions, statements, systemRoles } from "../modules/rbac/statements.ts";
import type { Env } from "../platform/config/index.ts";

/**
 * The SHARED part of the spec: info, security, and RESPONSE TYPE schemas. Body schemas
 * are not here — they derive straight from zod at the route (`http/api-docs.ts`),
 * so no copy can differ from the real validator.
 */

type Documentation = NonNullable<NonNullable<Parameters<typeof openAPIRouteHandler>[1]>["documentation"]>;

const uuid = { type: "string", format: "uuid" };

export const SCHEMAS: Record<string, Record<string, unknown>> = {
  Error: {
    type: "object",
    required: ["error", "meta"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", description: "Mis. UNAUTHORIZED / FORBIDDEN / VALIDATION_FAILED" },
          message: { type: "string" },
          fields: { type: "array", items: { type: "object" } },
        },
      },
      meta: { type: "object", properties: { requestId: { type: "string" } } },
    },
  },
  PublicUser: {
    type: "object",
    properties: {
      id: uuid,
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
            roleId: uuid,
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
      id: uuid,
      key: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      isSystem: { type: "boolean" },
      organizationId: uuid,
      permissions: { type: "array", items: { type: "string" } },
    },
  },
  Department: {
    type: "object",
    properties: {
      id: uuid,
      organizationId: uuid,
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
      id: uuid,
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
};

export const DOCUMENTATION = (env: Env) => ({
  title: "Bun ERP Template API",
  version: "1.0.0",
  description: [
    "REST API ERP (Hono). Setiap respons dibungkus `{data, meta.requestId}`.",
    "",
    `Autentikasi memakai cookie sesi Better Auth (\`cookieAuth\`). Server: \`${env.APP_URL}\`.`,
    `401 = belum login, 403 = login tapi izin kurang. Katalog izin: \`${allPermissions.join("`, `")}\`.`,
    "",
    `RBAC statements: \`${JSON.stringify(statements)}\``,
    `Role sistem: \`${Object.keys(systemRoles).join("`, `")}\`.`,
  ].join("\n"),
});

export const SERVERS = (env: Env) => [{ url: env.APP_URL, description: "API" }];

export const SECURITY_SCHEMES: NonNullable<NonNullable<Documentation["components"]>["securitySchemes"]> = {
  cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
};

export const BETTER_AUTH_TAGS: NonNullable<Documentation["tags"]> = [
  { name: "auth", description: "Sign-up, sign-in, sesi — ditangani Better Auth." },
];

/**
 * Better Auth handlers do not pass through `describeRoute`, so the operations the app uses
 * are written once here — not the whole Better Auth surface, only what a reviewer cares
 * about. These paths cannot be read from the router because the library owns them.
 */
export const BETTER_AUTH_PATHS: NonNullable<Documentation["paths"]> = {
  "/api/v1/auth/sign-in/email": {
    post: {
      tags: ["auth"],
      summary: "Masuk dengan e-mail & sandi (balasannya cookie sesi)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
            },
          },
        },
      },
      responses: { 200: { description: "Cookie sesi terpasang" }, 401: { description: "Kredensial salah" } },
    },
  },
  "/api/v1/auth/sign-out": {
    post: { tags: ["auth"], summary: "Keluar — sesi dihapus", responses: { 200: { description: "OK" } } },
  },
  "/api/v1/auth/get-session": {
    get: {
      tags: ["auth"],
      summary: "Sesi aktif (atau null)",
      responses: { 200: { description: "Objek sesi Better Auth" } },
    },
  },
};
