# ADR-0006 — Small VPS profile

**Status:** Accepted capacity target; not a measured guarantee.

Keep a small VPS profile with a 2 GB baseline; optional AI, renderers and monitoring are outside
that budget. Capacity depends on workload and deployed services. Old host RAM/swap/disk figures
are intentionally removed because they describe one deployment, not the reusable template.
Installing system services needs deployment-owner authorization.
