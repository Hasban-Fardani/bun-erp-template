/**
 * One planned edit to a core file, shared by the feature and infra installers. Installers compute
 * every edit before writing anything; a `skipped` edit aborts the whole install.
 */
export type WiringEdit = {
  path: string;
  source: string;
  status: "added" | "present" | "skipped";
  /** Why a skipped edit was skipped: a missing anchor or a half-wired file. */
  reason?: string;
};

/** Fail the install on the first skipped edit instead of leaving a half-wired feature behind. */
export function assertWiringAnchors(edits: readonly WiringEdit[], action = "auto-wire"): void {
  for (const entry of edits) {
    if (entry.status !== "skipped") continue;
    throw new Error(
      `Cannot ${action} ${entry.path}: ${entry.reason ?? "its anchor is missing"}. Restore the core file or wire manually.`,
    );
  }
}
