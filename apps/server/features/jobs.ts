import { JobRegistry } from "../platform/jobs/registry.ts";

/** Feature composition root for handlers. Add feature jobs here without coupling platform code to domains. */
export function createJobRegistry(): JobRegistry {
  return new JobRegistry();
}
