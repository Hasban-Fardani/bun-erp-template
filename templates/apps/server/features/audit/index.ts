/** Public surface for the audit feature; other features import it only through this file. */

export type { AuditEvent, AuditLog } from "./service.ts";
export { auditChange, recordAudit, snapshot } from "./service.ts";
