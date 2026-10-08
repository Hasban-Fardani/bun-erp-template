/**
 * Public surface of the mail feature. Other features and the composition root import from here only;
 * the `feature-boundary` rule in `check:architecture` rejects deep imports.
 */

export { mailChannel } from "./channel.ts";
export { createPasswordResetSender } from "./password-reset.ts";
export { createAppMailer, createMailEnqueue, registerMailJobs } from "./wiring.ts";
