/** Cloudflare sockets must never escape the request that created them. */
export async function usingWorkerContext<Context extends { close(): Promise<void> }, Result>(
  create: () => Context,
  execute: (context: Context) => Promise<Result>,
  execution: { waitUntil(promise: Promise<unknown>): void },
): Promise<Result> {
  const context = create();
  try {
    return await execute(context);
  } finally {
    execution.waitUntil(context.close());
  }
}
