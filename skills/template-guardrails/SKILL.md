---
name: template-guardrails
description: Use when verifying work or reporting a completed change in this template.
---

# Handoff guardrails

- Open source before claiming a capability exists. ADR decisions and old task results are not implementation evidence.
- Check actual `bun erp --help`; do not copy commands/counts from historical reports.
- When a gate fails, inspect its cause. Fix implementation first; do not weaken the rule.
- Prove a new gate fails with an intentional fixture, then passes restored source.
- Preserve original failing output alongside successful verification; do not claim retries erase a flake.
- No secrets/client data in source or evidence. Follow [security](../../docs/security.md).
- Verify UI classes/components in a real build/browser, not by JSX alone.
- Use Bun; platform exceptions and scope boundaries remain enforced.
- Run checks and appropriate tests after code changes. Distinguish API, browser and native-device coverage.

Evidence lives in tasks and ignored local QA output. Agents keep tasks `in_progress`;
humans alone approve `ready`/`done`. See [testing](../../docs/testing.md).
