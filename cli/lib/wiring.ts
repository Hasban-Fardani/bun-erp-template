/**
 * One planned edit to a core file, shared by the feature and infra installers. Installers compute
 * every edit before writing anything; a `skipped` or `partial` edit aborts the whole install.
 *
 * Presence is structural: an explicit marker comment the generators own (`// @loom:...`) plus the
 * generated lines. All present → `present`; none present → the edit can be applied; anything in
 * between → `partial`, so a half-wired file is never reported as `present`.
 */
export const WIRING_MARKERS = {
  permissions: "// @loom:permissions",
  audit: "// @loom:audit",
  routes: "// @loom:routes",
  nav: "// @loom:nav",
} as const;

export type WiringStatus = "added" | "present" | "partial" | "skipped";

export type WiringEdit = {
  path: string;
  source: string;
  status: WiringStatus;
  /** Why a skipped or partial edit was not applied: a missing marker or a half-wired file. */
  reason?: string;
};

export type WiringPresence = "present" | "apply" | "partial" | "skipped";

/**
 * Decides whether an edit is already applied, can be applied, or is half-wired. `artifacts` are
 * the generated lines (or key patterns) the edit leaves behind; the marker is the explicit
 * insertion point in the catalog file.
 */
export function wiringPresence(
  source: string,
  marker: string,
  artifacts: readonly (string | RegExp)[],
): WiringPresence {
  const markerPresent = source.includes(marker);
  const present = artifacts.filter((artifact) =>
    typeof artifact === "string" ? source.includes(artifact) : artifact.test(source),
  ).length;
  if (markerPresent && present === artifacts.length) return "present";
  if (!markerPresent && present === 0) return "skipped";
  if (markerPresent && present === 0) return "apply";
  return "partial";
}

/** Fail the install on the first skipped or partial edit instead of leaving a half-wired feature behind. */
export function assertWiringAnchors(edits: readonly WiringEdit[], action = "auto-wire"): void {
  for (const entry of edits) {
    if (entry.status !== "skipped" && entry.status !== "partial") continue;
    throw new Error(
      `Cannot ${action} ${entry.path}: ${entry.reason ?? "its anchor is missing"}. Restore the core file or wire manually.`,
    );
  }
}
