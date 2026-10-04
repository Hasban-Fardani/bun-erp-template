export type RetryDelayOptions = {
  attempt: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
};

/** Bounded exponential backoff with jitter for independent job and offline-sync workers. */
export function retryDelayMs({
  attempt,
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
  random = secureRandom,
}: RetryDelayOptions) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError("attempt must be a positive integer");
  if (baseDelayMs <= 0 || maxDelayMs < baseDelayMs) throw new RangeError("retry delay bounds are invalid");
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempt - 1, 30));
  const jittered = exponential * (0.5 + Math.min(1, Math.max(0, random())));
  return Math.round(Math.min(maxDelayMs, jittered));
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return (value[0] ?? 0) / 0x1_0000_0000;
}
