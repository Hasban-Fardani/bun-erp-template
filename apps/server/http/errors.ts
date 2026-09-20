import type { Context } from "hono";
import type * as z from "zod";

/** Stable error codes: klien boleh bergantung padanya, pesan boleh berubah. */
export const ErrorCode = {
  validationFailed: "VALIDATION_FAILED",
  notFound: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  internal: "INTERNAL_ERROR",
  configInvalid: "CONFIG_INVALID",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldError = { path: string; message: string };

/** Bentuk error tunggal untuk seluruh API (PRD §12). */
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

  /** 409 untuk bentrok state (kode unik sudah dipakai), bukan 422 yang berarti bentuk input salah. */
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

/** Sukses: `{ data, meta: { requestId } }` (PRD §12). */
export function ok<T>(c: Context, data: T): Response {
  return c.json({ data, meta: { requestId: requestId(c) } });
}

export function requestId(c: Context): string {
  return c.get("requestId") as string;
}

/** Parse input dengan compiled schema; error Zod diubah menjadi ApiError 422. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(result.error.issues);
  return result.data;
}
