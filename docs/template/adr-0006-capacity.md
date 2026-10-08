# ADR-0006 — Capacity target

**Status:** Superseded by the Cloudflare Workers Free target.

The original decision kept a 2 GB VPS baseline. The current capacity target is Cloudflare Workers
Free: one Worker for `/api` and `/api/*`, Workers Static Assets for the web build, 10 ms CPU per
invocation and the quotas in [deployment](../deployment.md) ("Workers Free plan"). Bun on a small
VPS stays the documented alternative host; capacity is answered per target by the measured Worker
budget in deployment.md, not by a fixed RAM figure. Installing system services needs
deployment-owner authorization.
