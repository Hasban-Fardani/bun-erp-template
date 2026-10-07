import { createUuid, retryDelayMs } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/migrate.ts";
import type { Logger } from "../observability/logger.ts";
import type { JobRegistry } from "./registry.ts";
import type { JobPayload } from "./schema.ts";

export type EnqueueJobInput = {
  name: string;
  payload: JobPayload;
  queue?: string;
  maxAttempts?: number;
  runAt?: Date;
  idempotencyKey?: string;
};

export type ClaimedJob = {
  id: string;
  name: string;
  queue: string;
  payload: JobPayload;
  attemptCount: number;
  maxAttempts: number;
  leaseToken: string;
};

const DEFAULT_LEASE_MS = 5 * 60_000;

// Drizzle maps typed columns to driver values, but parameters inside raw `sql` templates bypass that
// mapping while Drizzle still replaces postgres.js's timestamp serializer with an identity function.
// Pass timestamptz arguments as ISO strings, and let the database resolve `now()` so job scheduling
// never depends on the app clock drifting ahead of the database clock.

/** Call with the transaction used for a feature write to keep enqueue atomic with that write. */
export async function enqueueJob(db: Database, input: EnqueueJobInput): Promise<string> {
  const name = input.name.trim();
  const queue = input.queue?.trim() || "default";
  const maxAttempts = input.maxAttempts ?? 5;
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (!/^[a-z][a-z0-9_.-]{1,119}$/.test(name)) throw new Error("Job name must be a stable lowercase identifier");
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(queue)) throw new Error("Queue name must be a stable lowercase identifier");
  if (idempotencyKey && idempotencyKey.length > 200)
    throw new RangeError("idempotencyKey must not exceed 200 characters");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new RangeError("maxAttempts must be an integer between 1 and 100");
  }

  const id = createUuid();
  const inserted = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into background_jobs (id, job_name, queue_name, payload, status, max_attempts, run_at, idempotency_key)
      values (${id}, ${name}, ${queue}, ${JSON.stringify(input.payload)}::jsonb, 'pending', ${maxAttempts},
        coalesce(${input.runAt ? input.runAt.toISOString() : null}, now()), ${idempotencyKey})
      on conflict (queue_name, job_name, idempotency_key) do nothing
      returning id
    `),
  );
  if (inserted[0]) return inserted[0].id;
  if (!idempotencyKey) throw new Error("Job insert did not return an identifier");

  const existing = rowsOf<{ id: string }>(
    await db.execute(sql`
      select id from background_jobs
      where queue_name = ${queue} and job_name = ${name} and idempotency_key = ${idempotencyKey}
    `),
  );
  const existingId = existing[0]?.id;
  if (!existingId) throw new Error("Idempotent job could not be read after conflict");
  return existingId;
}

/** One atomic PostgreSQL claim; expired leases make crashed workers' jobs eligible again. */
export async function claimNextJob(
  db: Database,
  queue = "default",
  leaseMs = DEFAULT_LEASE_MS,
): Promise<ClaimedJob | null> {
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(queue)) throw new Error("Queue name must be a stable lowercase identifier");
  if (!Number.isFinite(leaseMs) || leaseMs < 3_000) throw new RangeError("leaseMs must be at least 3000 milliseconds");
  const leaseToken = createUuid();
  const leaseSeconds = Math.max(1, Math.ceil(leaseMs / 1_000));
  const result = rowsOf<ClaimedJob>(
    await db.execute(sql`
      with expired as (
        update background_jobs
        set status = 'dead', lease_token = null, lease_expires_at = null,
            last_error_code = 'JOB_LEASE_EXPIRED', updated_at = now()
        where queue_name = ${queue} and status = 'running' and lease_expires_at <= now()
          and attempt_count >= max_attempts
        returning id
      ), candidate as (
        select id from background_jobs
        where queue_name = ${queue} and attempt_count < max_attempts
          and ((status = 'pending' and run_at <= now()) or (status = 'running' and lease_expires_at <= now()))
        order by run_at asc, created_at asc
        limit 1 for update skip locked
      )
      update background_jobs as job
      set status = 'running', attempt_count = job.attempt_count + 1, lease_token = ${leaseToken},
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second'), updated_at = now()
      from candidate
      where job.id = candidate.id
      returning job.id, job.job_name as name, job.queue_name as queue, job.payload,
        job.attempt_count as "attemptCount", job.max_attempts as "maxAttempts", job.lease_token as "leaseToken"
    `),
  );
  return result[0] ?? null;
}

export async function runNextJob(
  db: Database,
  registry: JobRegistry,
  logger: Logger,
  options: { queue?: string; leaseMs?: number; retryBaseMs?: number; retryMaxMs?: number } = {},
): Promise<boolean> {
  const job = await claimNextJob(db, options.queue, options.leaseMs);
  if (!job) return false;
  const handler = registry.get(job.name);
  if (!handler) {
    // A rolling deploy may not have registered the handler yet: release the claim and retry with
    // bounded backoff instead of dead-lettering a job the next replica can run.
    const errorCode = "JOB_HANDLER_NOT_REGISTERED";
    const { updated, terminal } = await retryOrDeadLetter(db, job, errorCode, options);
    if (!updated) {
      logger.warn({ event: "job.lease_lost", jobId: job.id, jobName: job.name });
    } else if (terminal) {
      logger.error({ event: "job.dead", jobId: job.id, jobName: job.name, errorCode, attempt: job.attemptCount });
    } else {
      logger.warn({ event: "job.handler_missing", jobId: job.id, jobName: job.name, attempt: job.attemptCount });
    }
    return true;
  }

  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  let leaseLost = false;
  const heartbeat = setInterval(
    () => {
      void renewLease(db, job, leaseMs)
        .then((renewed) => {
          if (!renewed) leaseLost = true;
        })
        .catch(() => {
          // Only a zero-row renewal means the lease was taken; a transient error must not discard
          // a result the handler already produced. `finish()` is the authority on ownership.
          logger.warn({
            event: "job.lease_renew_failed",
            jobId: job.id,
            jobName: job.name,
            errorCode: "JOB_LEASE_RENEW_FAILED",
          });
        });
    },
    Math.max(1_000, Math.floor(leaseMs / 3)),
  );
  logger.info({ event: "job.started", jobId: job.id, jobName: job.name, attempt: job.attemptCount });

  try {
    await handler(job.payload, { db, jobId: job.id, attempt: job.attemptCount });
    if (leaseLost) {
      logger.warn({ event: "job.lease_lost", jobId: job.id, jobName: job.name });
      return true;
    }
    if (await finish(db, job, "completed")) {
      logger.info({ event: "job.completed", jobId: job.id, jobName: job.name });
    } else {
      logger.warn({ event: "job.lease_lost", jobId: job.id, jobName: job.name });
    }
  } catch (error) {
    if (leaseLost) {
      logger.warn({ event: "job.lease_lost", jobId: job.id, jobName: job.name });
      return true;
    }
    const errorCode = safeErrorCode(error);
    const { updated, terminal } = await retryOrDeadLetter(db, job, errorCode, options);
    if (updated) {
      logger.error({
        event: terminal ? "job.dead" : "job.retry_scheduled",
        jobId: job.id,
        jobName: job.name,
        errorCode,
        attempt: job.attemptCount,
      });
    } else {
      logger.warn({ event: "job.lease_lost", jobId: job.id, jobName: job.name });
    }
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

/** Reschedules with bounded backoff, or dead-letters at max attempts; `updated` is false when the lease was lost. */
async function retryOrDeadLetter(
  db: Database,
  job: ClaimedJob,
  errorCode: string,
  options: { retryBaseMs?: number; retryMaxMs?: number },
): Promise<{ updated: boolean; terminal: boolean }> {
  const terminal = job.attemptCount >= job.maxAttempts;
  const delayMs = retryDelayMs({
    attempt: job.attemptCount,
    baseDelayMs: options.retryBaseMs ?? 1_000,
    maxDelayMs: options.retryMaxMs ?? 60_000,
  });
  const updated = await finish(db, job, terminal ? "dead" : "pending", errorCode, terminal ? undefined : delayMs);
  return { updated, terminal };
}

export async function runJobBatch(
  db: Database,
  registry: JobRegistry,
  logger: Logger,
  options: { queue?: string; leaseMs?: number; retryBaseMs?: number; retryMaxMs?: number; limit?: number } = {},
): Promise<number> {
  const limit = options.limit ?? 20;
  let processed = 0;
  while (processed < limit && (await runNextJob(db, registry, logger, options))) processed += 1;
  return processed;
}

/** Manual operator recovery for a reviewed dead job; automatic retries never reset the attempt count. */
export async function requeueDeadJob(db: Database, id: string): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update background_jobs
      set status = 'pending', attempt_count = 0, run_at = now(), lease_token = null,
          lease_expires_at = null, last_error_code = null, completed_at = null, updated_at = now()
      where id = ${id} and status = 'dead'
      returning id
    `),
  );
  return rows.length === 1;
}

async function renewLease(db: Database, job: ClaimedJob, leaseMs: number): Promise<boolean> {
  const leaseSeconds = Math.max(1, Math.ceil(leaseMs / 1_000));
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update background_jobs set lease_expires_at = now() + (${leaseSeconds} * interval '1 second'), updated_at = now()
      where id = ${job.id} and status = 'running' and lease_token = ${job.leaseToken} returning id
    `),
  );
  return rows.length === 1;
}

async function finish(
  db: Database,
  job: ClaimedJob,
  status: "pending" | "completed" | "dead",
  errorCode?: string,
  retryDelayMs?: number,
): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
    update background_jobs
    set status = ${status}, lease_token = null, lease_expires_at = null, last_error_code = ${errorCode ?? null},
        run_at = coalesce(now() + (${retryDelayMs ?? null} * interval '1 millisecond'), run_at),
        completed_at = case when ${status} = 'completed' then now() else null end,
        updated_at = now()
    where id = ${job.id} and status = 'running' and lease_token = ${job.leaseToken}
    returning id
  `),
  );
  if (rows.length === 1 && status !== "pending") {
    // A schedule mirrors the terminal outcome of the job its tick enqueued; manual jobs match no row.
    await db.execute(sql`
      update job_schedules set last_status = ${status}, last_error = ${errorCode ?? null}, updated_at = now()
      where name = ${job.name}
    `);
  }
  return rows.length === 1;
}

function safeErrorCode(error: unknown): string {
  const candidate =
    error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : "JOB_HANDLER_FAILED";
}
