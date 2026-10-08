import { afterEach, expect, test } from "bun:test";
import { identityKeys } from "../../src/features/identity/api/keys.ts";
import { sessionQuery } from "../../src/features/identity/api/queries.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function queryFn() {
  const run = sessionQuery.queryFn;
  if (!run) throw new Error("sessionQuery must declare a queryFn");
  return run({} as never);
}

test("the session query owns the shared identity key", () => {
  expect(sessionQuery.queryKey[0]).toBe(identityKeys.session[0]);
});

test("the session query resolves identity and permissions from one /me request", async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return Response.json({
      data: { userId: "u1", name: "Ada", email: "ada@example.test", permissions: ["user.read"] },
      meta: { requestId: "test" },
    });
  }) as unknown as typeof fetch;

  const session = await queryFn();

  expect(requested).toHaveLength(1);
  expect(requested[0]).toContain("/api/v1/me");
  expect(session).toEqual({
    authenticated: true,
    user: { id: "u1", name: "Ada", email: "ada@example.test" },
    permissions: ["user.read"],
    impersonation: null,
  });
});

test("the session query maps a 401 from /me to the signed-out view", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: "UNAUTHORIZED", message: "No session" }, meta: { requestId: "test" } },
      { status: 401 },
    )) as unknown as typeof fetch;

  expect(await queryFn()).toEqual({ authenticated: false, user: null, permissions: [] });
});
