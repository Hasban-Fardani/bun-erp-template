/** The audit-facing slice of an actor: who did it, under which trace, with a frozen display label. */
export function actorOf(actor: {
  userId: string;
  traceId: string;
  label: string;
  impersonator?: { userId: string; label: string };
}) {
  return {
    userId: actor.userId,
    traceId: actor.traceId,
    label: actor.label,
    // While an admin impersonates, every audit row names both: the target as actor, the admin here.
    impersonator: actor.impersonator ? { userId: actor.impersonator.userId, label: actor.impersonator.label } : null,
  };
}
