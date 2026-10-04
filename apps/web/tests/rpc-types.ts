import type { AppType } from "@bun-erp/server/app-type";
import { hc, type InferResponseType } from "hono/client";

const client = hc<AppType>("http://localhost:3000");
type DepartmentList = InferResponseType<typeof client.api.v1.departments.$get, 200>;
type ErrorBody = InferResponseType<typeof client.api.v1.departments.$get, 422>;

/** Not executed: tsc must prove valid inputs, DTOs and global errors, and reject drift. */
export function rpcTypeContract(list: DepartmentList, error: ErrorBody) {
  const name: string | undefined = list.data.items[0]?.name;
  const fieldPath: string | undefined = error.error.fields?.[0]?.path;
  void client.api.v1.departments.$get({ query: { page: "2", sort: "name" } });
  // @ts-expect-error A query property outside the schema must fail compilation.
  void client.api.v1.departments.$get({ query: { invented: "wrong" } });
  // @ts-expect-error The RPC body requires the department code.
  void client.api.v1.departments.$post({ json: { name: "Example" } });
  return { name, fieldPath };
}
