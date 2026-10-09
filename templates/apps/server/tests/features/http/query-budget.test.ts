import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { configurePermissionCache } from "@/features/rbac/cache.ts";
import { createApp } from "@/http/app.ts";
import { QUERY_BUDGETS } from "@/http/query-budget.ts";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";
import { countQueries } from "../../support/query-budget.ts";

let api: HttpFixture;
beforeEach(async () => {
  api = await createHttpFixture();
  // Workers run with the permission cache off (isolates share nothing): measure that worst case.
  configurePermissionCache({ enabled: false });
});
afterEach(() => configurePermissionCache({ enabled: true }));

/** Rebuilds the app per call, the way the Worker does, so no per-app memory hides a query. */
const fresh = (cookie: string) => createTestClient(createApp(api.ctx), cookie);

/** Measured routes: a count above the budget fails here, with the statements, before it reaches production. */
const MEASURED = {
  "GET /api/v1/me": (cookie: string) => fresh(cookie).api.v1.me.$get(),
  "GET /api/v1/users": (cookie: string) => fresh(cookie).api.v1.users.$get({ query: {} }),
  "GET /api/v1/notifications/unread-count": (cookie: string) =>
    fresh(cookie).api.v1.notifications["unread-count"].$get(),
} as const;

describe("query budget per authenticated request (cold app, as on Workers)", () => {
  for (const [route, call] of Object.entries(MEASURED)) {
    test(`${route} stays within its budget`, async () => {
      const cookie = await api.signInAsOwner();
      await call(cookie); // warm module-level TTL caches the way a live isolate does
      const report = await countQueries(() => call(cookie));
      const budget = QUERY_BUDGETS[route] as number;
      expect(budget).toBeGreaterThan(0);
      if (report.count > budget)
        console.log(`${route}: ${report.count} > ${budget}\n  ${report.statements.join("\n  ")}`);
      expect(report.count).toBeLessThanOrEqual(budget);
    });
  }

  test("every budgeted route has a measurement", () => {
    expect(Object.keys(MEASURED).sort()).toEqual(Object.keys(QUERY_BUDGETS).sort());
  });
});
