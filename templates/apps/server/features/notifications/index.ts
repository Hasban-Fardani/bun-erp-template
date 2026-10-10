/**
 * Public surface of the notifications feature. Other features import from here only — the
 * `feature-boundary` rule in `check:architecture` rejects deep imports.
 */
export { countUnread, listUnreadTitles, notify } from "./service.ts";
export type { NotificationChannelFactory, NotifyInput } from "./types.ts";
// @loom:notifications
