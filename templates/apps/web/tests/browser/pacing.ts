/**
 * Better Auth limits sign-in to 3 requests per 10 s window per IP, and the window only resets once
 * 10 s pass without a request. A QA run signs in more often than that, so a streak of 3 attempts
 * is followed by a pause until the window has certainly reset.
 */
const WINDOW_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MARGIN_MS = 1_000;

const attempts: number[] = [];

/** Milliseconds to wait before another attempt at `now` stays inside the limit. */
export function signInDelay(history: readonly number[], now: number): number {
  let streak = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const time of history) {
    streak = time - previous < WINDOW_MS ? streak + 1 : 1;
    previous = time;
  }
  if (history.length === 0 || now - previous >= WINDOW_MS) return 0;
  return streak >= MAX_ATTEMPTS ? previous + WINDOW_MS + MARGIN_MS - now : 0;
}

/** Waits as needed, then records the attempt. */
export async function paceSignIn(): Promise<void> {
  const delay = signInDelay(attempts, Date.now());
  if (delay > 0) await Bun.sleep(delay);
  attempts.push(Date.now());
}
