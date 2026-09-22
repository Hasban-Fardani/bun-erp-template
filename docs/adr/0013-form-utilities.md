# ADR-0013 — Form utilities: native first, one small dependency where the platform is not enough

**Status:** Accepted

## Context

Metronic's form toolkit was reviewed as a candidate set (docs/riset/metronic-utils.md). The
question was not "which are nice" but "which earn their bytes". Some entries in that list are
not utilities at all — "Exclusive" is a documentation badge. Several were already dead
upstream (Daterangepicker last released 2020, Flatpickr 2022).

The template already has `zod`, Radix primitives, and Tailwind. Every added dependency is
inherited by every project copied from this template, so the bar is high.

## Decision

1. **Native first.** These are built on platform APIs, not packages:
   - masked number input → `Intl.NumberFormat("id-ID")` with a controlled caret
   - file upload → `drop` + `DataTransfer` + `xhr.upload.onprogress`
   - form validation → Constraint Validation (`:user-invalid`) + the `zod` contract already on
     the server, so one rule set instead of two
   - password strength → server-side policy (NIST 800-63B favours length over character classes)
   - form repeat, chips, multi-select → React over existing `Badge`/`IconButton`/`Select`
2. **One dependency is accepted when the platform genuinely falls short:** remote-search
   combobox and a date-range picker. `<datalist>` cannot do paginated remote search, and
   `input[type=date]` cannot do ranges. Prefer `imask` (15.7 kB) over `inputmask` (54.8 kB).
3. **Rejected:** reCAPTCHA (rate limiting + the audit trail covers abuse, and it would break the
   portable API in ADR-0011), jQuery-era plugins, and any picker that drags in moment.js.

## Consequences

- The template stays small and the "no dependency when the platform suffices" rule in
  AGENTS.md keeps its teeth.
- Password strength is enforced once, on the server, instead of being a UI hint that a client
  can ignore.
- If a picked dependency is later added, its choice belongs in this ADR, not in a comment.

**Rejected alternatives:** adopting the Metronic list wholesale (most entries duplicate native
capabilities and would triple the bundle); dropping all of them (remote combobox and date range
are genuinely useful and genuinely hard to build well).
