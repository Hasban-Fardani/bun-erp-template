# ADR-0013 — Platform-first forms

**Status:** Accepted dependency policy; not a feature inventory.

Use native inputs, Constraint Validation, Intl, Clipboard and existing React/Radix/Zod primitives
before adding form libraries. Remote search or date ranges may justify a dependency only after
measuring a real gap. No blanket authorization to install a named package is implied.

Wholesale Metronic/jQuery toolkits, moment-based pickers and speculative CAPTCHA adoption were
rejected. Historical package sizes/release dates live in research, not this decision.
Server validation remains authoritative; do not duplicate business rules in UI hints.
