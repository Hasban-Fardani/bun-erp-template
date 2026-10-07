import { expect, test } from "bun:test";
import type { AppContext } from "@/bootstrap/context.ts";
import { createApp } from "@/http/app.ts";
import { createSeededApp } from "../../support/fixtures.ts";

test("/ready reports ready when the database answers", async () => {
  const api = await createSeededApp();
  const response = await api.app.request("/api/v1/ready");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ready", checks: { database: { ok: true } } });
});

test("/ready answers 503, not 500, when the database check fails", async () => {
  const api = await createSeededApp();
  const db = new Proxy(api.ctx.db, {
    get(target, property, receiver) {
      if (property === "execute") {
        return async () => {
          throw new Error("database unavailable");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as AppContext["db"];

  // A readiness probe reads the status code, so an unavailable dependency must be a 503.
  const response = await createApp({ ...api.ctx, db }).request("/api/v1/ready");
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: "unavailable", checks: { database: { ok: false } } });
});
