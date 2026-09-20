# ADR-0001 — Web router: TanStack Router

**Status:** Diterima

## Keputusan

Satu vendor dengan TanStack Query/Table yang sudah di stack. Typed routes + search-param
schema berbasis Zod, sejalan dengan prinsip explicit over magic.

**Konsekuensi:** file-based route generation; tidak ada React Router.

**Alternatif ditolak:** React Router.
