import { sql } from "drizzle-orm";
import type { AppContext } from "../bootstrap/context.ts";
import type { Database } from "../database/index.ts";
import { rowsOf } from "../database/rows.ts";
import { auditChange } from "../features/audit/index.ts";
import { resolveActor } from "../features/identity/policy.ts";
import { factory } from "./factory.ts";
import { type ApiErrorBody, ErrorCode, requestId } from "./helpers/errors.ts";

const API_PREFIX = "/api/v1";
const STATE_KEY = "maintenance";
const DEFAULT_MESSAGE = "The service is under maintenance. Please try again shortly.";
/** Read cache TTL: an optimisation only, so a change made elsewhere reaches a process within this window. */
const CACHE_TTL_MS = 2000;
const RETRY_AFTER_SECONDS = "30";

export type MaintenanceState = { down: boolean; message?: string };

/**
 * Process-wide TTL cache per database handle. A Cloudflare Worker rebuilds the app on every
 * request, so a cache held inside the app never hit; module scope survives while the isolate does.
 * The database stays authoritative: the TTL bounds staleness and `setMaintenance` drops the entry
 * for the process that wrote.
 */
const stateCache = new WeakMap<Database, { state: MaintenanceState; readAt: number }>();
let clock: () => number = Date.now;

/** Test hook: inject a clock. Pass nothing to restore `Date.now`. */
export function setMaintenanceClock(next?: () => number): void {
  clock = next ?? Date.now;
}

/** Drops the cached state of one database handle (tests and writers). */
export function resetMaintenanceCache(db: Database): void {
  stateCache.delete(db);
}

async function cachedMaintenance(db: Database): Promise<MaintenanceState> {
  const now = clock();
  const hit = stateCache.get(db);
  if (hit && now - hit.readAt < CACHE_TTL_MS) return hit.state;
  const state = await getMaintenance(db);
  stateCache.set(db, { state, readAt: now });
  return state;
}

export async function getMaintenance(db: Database): Promise<MaintenanceState> {
  const rows = rowsOf<{ value: { down?: boolean; message?: string } | null }>(
    await db.execute(sql`select value from app_state where key = ${STATE_KEY}`),
  );
  const value = rows[0]?.value;
  if (!value?.down) return { down: false };
  return value.message ? { down: true, message: value.message } : { down: true };
}

/** Writes the switch and records who flipped it; the CLI and tests are the only writers. */
export async function setMaintenance(
  db: Database,
  state: MaintenanceState,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<void> {
  resetMaintenanceCache(db);
  const value = state.down ? { down: true, ...(state.message ? { message: state.message } : {}) } : { down: false };
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into app_state (key, value, updated_at) values (${STATE_KEY}, ${JSON.stringify(value)}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    `);
    await auditChange(tx, {
      actor,
      event: state.down ? "app.maintenance_enabled" : "app.maintenance_disabled",
      subject: { type: "app", id: STATE_KEY },
      after: value,
    });
  });
}

/**
 * While maintenance is on, `/api/v1/*` answers 503 except the probes, Better Auth (so the owner
 * can still sign in) and sessions holding `app.maintenance_bypass`.
 */
export function maintenanceMode(ctx: AppContext) {
  return factory.createMiddleware(async (c, next) => {
    const path = c.req.path;
    const exempt =
      !path.startsWith(`${API_PREFIX}/`) ||
      path === `${API_PREFIX}/health` ||
      path === `${API_PREFIX}/ready` ||
      path.startsWith(`${API_PREFIX}/auth/`);
    if (exempt) return next();

    const state = await cachedMaintenance(ctx.db);
    if (!state.down) return next();

    const actor = await resolveActor(c, ctx);
    if (actor?.permissions.includes("app.maintenance_bypass")) return next();

    const body: ApiErrorBody = {
      error: { code: ErrorCode.unavailable, message: state.message ?? DEFAULT_MESSAGE },
      meta: { requestId: requestId(c) },
    };
    return c.json(body, 503, { "Retry-After": RETRY_AFTER_SECONDS });
  });
}
