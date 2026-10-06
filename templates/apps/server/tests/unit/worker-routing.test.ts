import { expect, test } from "bun:test";
import type { WorkerBindings } from "../../bootstrap/cloudflare-context.ts";
import worker from "../../bootstrap/worker.ts";
import { isApiPath } from "../../http/routing.ts";
import { requiresOrganizationId } from "../../infra/cloudflare/routing.ts";

test("Cloudflare sends only the API namespace through the Worker", () => {
  expect(isApiPath("/api")).toBe(true);
  expect(isApiPath("/api/v1/health")).toBe(true);
  expect(isApiPath("/apiary")).toBe(false);
  expect(isApiPath("/users")).toBe(false);
});

test("auth, health and docs requests do not spend a tenant lookup query", () => {
  expect(requiresOrganizationId("/api/v1/auth/sign-in/email")).toBe(false);
  expect(requiresOrganizationId("/api/v1/auth/get-session")).toBe(false);
  expect(requiresOrganizationId("/api/v1/health")).toBe(false);
  expect(requiresOrganizationId("/api/v1/ready")).toBe(false);
  expect(requiresOrganizationId("/api/docs")).toBe(false);
  expect(requiresOrganizationId("/api/v1/users")).toBe(true);
  expect(requiresOrganizationId("/api/v1/users", "OPTIONS")).toBe(false);
});

test("non-API requests use static assets or return 404 without creating an API context", async () => {
  const request = new Request("https://example.test/users", { method: "GET" });
  const bindings = {
    HYPERDRIVE: { connectionString: "unused-for-static-assets" },
    ASSETS: { fetch: async (received: Request) => new Response(new URL(received.url).pathname) },
  } as WorkerBindings;
  const execution = {
    waitUntil: () => {
      throw new Error("Static paths must not schedule work");
    },
  };

  const asset = await worker.fetch(request, bindings, execution);
  expect(asset.status).toBe(200);
  expect(await asset.text()).toBe("/users");

  const notFound = await worker.fetch(request, { HYPERDRIVE: bindings.HYPERDRIVE } as WorkerBindings, execution);
  expect(notFound.status).toBe(404);
});
