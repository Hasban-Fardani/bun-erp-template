import type { Context } from "hono";
import type * as z from "zod";

/** Stable error codes: clients may depend on them, messages may change. */
export const ErrorCode = {
  badRequest: "BAD_REQUEST",
  validationFailed: "VALIDATION_FAILED",
  unauthorized: "UNAUTHORIZED",
  notFound: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  internal: "INTERNAL_ERROR",
  configInvalid: "CONFIG_INVALID",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldError = { path: string; message: string };

/** Single error shape for the whole API (PRD §12). */
export type ApiErrorBody = {
  error: { code: ErrorCodeValue; message: string; fields?: FieldError[]; details?: Record<string, unknown> };
  meta: { requestId: string };
};

export class ApiError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly fields: FieldError[] | undefined;
  /** Machine-readable extras (for example the current row version); never secrets. */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCodeValue,
    status: number,
    message: string,
    fields?: FieldError[],
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.details = details;
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(ErrorCode.notFound, 404, message);
  }

  /** 401 = no identity yet. 403 = identity exists, permission does not. Never swap them. */
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(ErrorCode.unauthorized, 401, message);
  }

  static forbidden(message = "Permission denied"): ApiError {
    return new ApiError(ErrorCode.forbidden, 403, message);
  }

  /** 409 for a state conflict (unique code already taken), not 422 which means malformed input. */
  static conflict(message: string, path = "code"): ApiError {
    return new ApiError(ErrorCode.conflict, 409, message, [{ path, message: "already in use" }]);
  }

  /** 409 for a database-enforced uniqueness conflict (a concurrent create), not malformed input. */
  static duplicate(message = "Resource already exists"): ApiError {
    return new ApiError(ErrorCode.conflict, 409, message);
  }

  /** 409 for a stale optimistic-locking write; `details.currentVersion` is the row's live version. */
  static versionConflict(currentVersion: number): ApiError {
    return new ApiError(
      ErrorCode.conflict,
      409,
      `Stale write: the row is now at version ${currentVersion}`,
      undefined,
      {
        currentVersion,
      },
    );
  }

  static validation(issues: readonly z.core.$ZodIssue[]): ApiError {
    return new ApiError(
      ErrorCode.validationFailed,
      422,
      "Request validation failed",
      issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }

  static internal(): ApiError {
    return new ApiError(ErrorCode.internal, 500, "Internal server error");
  }
}

/** Success: `{ data, meta: { requestId } }` (PRD §12). */
export function ok<T>(c: Context, data: T) {
  return c.json({ data, meta: { requestId: requestId(c) } }, 200);
}

export function requestId(c: Context): string {
  return c.get("requestId") as string;
}

/**
 * PostgreSQL SQLSTATE 23505: a unique index rejected the write. Drizzle wraps driver errors in
 * `DrizzleQueryError` with the driver error as `cause`, so the chain is inspected, not just the top.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    if (typeof current === "object" && "code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
