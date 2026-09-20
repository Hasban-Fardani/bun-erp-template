export type ApiSuccess<T> = { data: T; meta: { requestId: string } };
export type ApiFailure = {
  error: { code: string; message: string; fields?: Record<string, string> };
  meta: { requestId: string };
};

/** Satu gerbang fetch: same-origin via proxy Vite, kredensial cookie selalu ikut. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = (await res.json()) as ApiSuccess<T> | ApiFailure;
  if (!res.ok || "error" in body) {
    const err = "error" in body ? body.error : { code: "unknown", message: res.statusText };
    throw new ApiError(res.status, err.code, err.message, err.fields);
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
