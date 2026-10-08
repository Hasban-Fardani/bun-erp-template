/** The audit-facing slice of an actor: who did it, under which trace, with a frozen display label. */
export function actorOf(actor: { userId: string; traceId: string; label: string }) {
  return { userId: actor.userId, traceId: actor.traceId, label: actor.label };
}
