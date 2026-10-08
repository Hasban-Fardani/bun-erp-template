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
/** Per-app read cache: an optimisation only, so a change reaches a replica within this window. */
const CACHE_TTL_MS = 2000;
const RETRY_AFTER_SECONDS = "30";

export type MaintenanceState = { down: boolean; message?: string };

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
  let cached: { state: MaintenanceState; readAt: number } | undefined;

  async function current(): Promise<MaintenanceState> {
    const now = Date.now();
    if (cached && now - cached.readAt < CACHE_TTL_MS) return cached.state;
    const state = await getMaintenance(ctx.db);
    cached = { state, readAt: now };
    return state;
  }

  return factory.createMiddleware(async (c, next) => {
    const path = c.req.path;
    const exempt =
      !path.startsWith(`${API_PREFIX}/`) ||
      path === `${API_PREFIX}/health` ||
      path === `${API_PREFIX}/ready` ||
      path.startsWith(`${API_PREFIX}/auth/`);
    if (exempt) return next();

    const state = await current();
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
