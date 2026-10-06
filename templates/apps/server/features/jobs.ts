import type { AppContext } from "../bootstrap/context.ts";
import { JobRegistry } from "../infra/jobs/registry.ts";
import type { ScheduleDefinition } from "../infra/jobs/scheduler.ts";

/**
 * Feature composition root for handlers. Add feature jobs here without coupling platform code to
 * domains; `bun erp features:install mail` adds the `mail.send` handler.
 */
export function createJobRegistry(_ctx: Pick<AppContext, "env" | "db" | "logger">): JobRegistry {
  const registry = new JobRegistry();
  for (const schedule of createSchedules(_ctx)) registry.register(schedule.name, schedule.handler);
  return registry;
}

/**
 * Feature composition root for schedules: each `defineSchedule` pairs a job handler with a cron
 * expression, and the tick enqueues one job per due schedule. The default install declares none.
 */
export function createSchedules(_ctx: Pick<AppContext, "env" | "db" | "logger">): ScheduleDefinition[] {
  return [];
}
