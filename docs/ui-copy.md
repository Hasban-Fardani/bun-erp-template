# What an operator sees

This is an internal business tool. The person using it handles orders, approvals, and stock —
not servers. Screen text is judged by one question: **does this help them decide or act?**

Enforced by `bun erp check:copy`, which scans rendered strings only (JSX text and display props).
Identifiers, import paths, and comments are not user-facing, so they are not checked.

## What may appear

- **Business states**: `Diajukan`, `Disetujui`, `Ditolak`, `Draft`, `Selesai`, `Belum dibayar`.
  This is the most valuable status text in the product. A badge saying `Disetujui` answers a
  question the operator actually has; a badge saying `API aktif` answers one they do not.
- **Actions in their language**: `Ajukan penawaran`, `Setujui`, `Tolak`, `Cetak`.
- **Data they own**: names, dates in `id-ID`, amounts, counts.
- **What went wrong, in their terms**: "Penawaran gagal disimpan" — then what to do next.

## What never appears

- Infrastructure: API, endpoint, backend, server, database, cache, token, cookie, deploy.
- The word **session**. The operator has an account. `Memuat sesi…` is a symptom, not a message.
- **Raw permission identifiers** (`user.read`, `role.read`). Name who can do the thing instead:
  "Hanya pemilik yang dapat mengatur peran dan izin."
- Shell commands. A pre-auth screen once printed `bun erp user:passwd`; anyone loading the page
  learned the tooling, the user model, and that password resets need shell access.
- Build and runtime vocabulary: build, config, module, migration, schema, query, trace.
- File paths, stack traces, HTTP status codes, request ids.

## Status text: the test that settles most arguments

Ask what decision the text can change.

- `API aktif` — none, ever. It cannot go red in a way the operator can act on, so it is
  decoration competing with the primary action. Delete it.
- `Disetujui` — whether to proceed. Keep it.
- A warning when something is genuinely broken — whether to wait or find another way. Keep it,
  and only show it when it is true.

If a status element can only ever report good news, it does not belong on screen.

## Errors

Say what happened and what to do, in the operator's words. Never the exception message, never a
code. Logs carry the detail; the screen carries the next step.

## Badges and labels follow the same rule

A badge is status on **their data**. `Menunggu persetujuan` on an order is useful. `v1.4.2`,
`Beta`, `Cached`, `Synced` are not — the operator cannot act on any of them, and each one costs
attention they owe to the work.
