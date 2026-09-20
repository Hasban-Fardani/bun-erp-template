# ADR-0008 — Distribusi: satu repo template, client menyalin

**Status:** Diterima

## Keputusan

Satu repo `bun-erp-template`. Proyek client dibuat dengan copy atau fork bersih.
`template.scope.json` adalah allowlist di repo template; proyek client menambah
manifest-nya sendiri di salinannya.

**Konsekuensi:** nama client dan aturan bisnis dilarang masuk repo template —
ditegakkan `bun erp check:scope`.

**Alternatif ditolak:** multi-tenant di dalam template.
