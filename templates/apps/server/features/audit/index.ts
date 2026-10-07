/**
 * Public surface of the audit feature. Other features import from here only — the
 * `feature-boundary` rule in `check:architecture` rejects deep imports — so extracting audit as
 * a service means moving the folder and repointing this entry.
 */
export { auditChange, recordAudit, snapshot } from "./service.ts";
