import { expect, test } from "bun:test";
import { ApiError } from "../src/lib/api.ts";
import { createQueryClient } from "../src/lib/query-client.ts";
import { call } from "../src/lib/rpc.ts";

test("4xx failures do not retry; an expired session clears private data and redirects once", async () => {
  let redirects = 0;
  let requests = 0;
  const client = createQueryClient(() => redirects++);
  client.setQueryData(["session"], { authenticated: true });
  client.setQueryData(["users"], [{ id: "private" }]);
  await expect(
    client.fetchQuery({
      queryKey: ["expired"],
      queryFn: async () => {
        requests++;
        throw new ApiError(401, "UNAUTHORIZED", "Expired");
      },
    }),
  ).rejects.toThrow("Expired");
  expect(requests).toBe(1);
  expect(redirects).toBe(1);
  expect(client.getQueryData(["users"])).toBeUndefined();
  await expect(
    client.fetchQuery({
      queryKey: ["session"],
      queryFn: async () => {
        throw new ApiError(401, "UNAUTHORIZED", "Expired");
      },
    }),
  ).rejects.toThrow("Expired");
  expect(redirects).toBe(1);
  client.clear();
});

test("RPC validation preserves the server field array", async () => {
  const fields = [{ path: "name", message: "Required" }];
  const response = Response.json(
    { error: { code: "VALIDATION_FAILED", message: "Invalid", fields }, meta: { requestId: "test" } },
    { status: 422 },
  );
  await expect(call(Promise.resolve(response))).rejects.toMatchObject({ status: 422, fields });
});
