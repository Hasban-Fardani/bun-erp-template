import type { Context } from "hono";
import type * as z from "zod";

/** Stable error codes: clients may depend on them, messages may change. */
export const ErrorCode = {
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
  error: { code: ErrorCodeValue; message: string; fields?: FieldError[] };
  meta: { requestId: string };
};

export class ApiError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly fields: FieldError[] | undefined;

  constructor(code: ErrorCodeValue, status: number, message: string, fields?: FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
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
    return new ApiError(ErrorCode.conflict, 409, message, [{ path, message: "already in use in this organization" }]);
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
export function ok<T>(c: Context, data: T): Response {
  return c.json({ data, meta: { requestId: requestId(c) } });
}

export function requestId(c: Context): string {
  return c.get("requestId") as string;
}

/** Parse input with the compiled schema; Zod errors become ApiError 422. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(result.error.issues);
  return result.data;
}
