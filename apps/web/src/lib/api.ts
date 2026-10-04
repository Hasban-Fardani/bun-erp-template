import type { RpcError } from "@bun-erp/server/app-type";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: RpcError["error"]["fields"],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
