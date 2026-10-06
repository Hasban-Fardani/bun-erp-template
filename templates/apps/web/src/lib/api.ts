/**
 * Wire envelope shared with the server contract (docs/api-contract.md). Kept structural so the
 * web shell typechecks even when the server app is not installed (Q30 detached mode).
 */
export type FieldError = { path: string; message: string };
export type ApiErrorBody = {
  error: { code: string; message: string; fields?: FieldError[] };
  meta: { requestId: string };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
