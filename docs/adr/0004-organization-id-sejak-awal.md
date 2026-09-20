# ADR-0004 — `organization_id` ada sejak migration pertama

**Status:** Diterima

## Keputusan

Single-tenant tetap default (satu baris organisasi), tetapi kolom `organization_id` ada
di tabel bisnis sejak awal. Menambahkannya setelah RBAC dan data produksi ada berarti
expand-contract, backfill, dan risiko data loss. Menambah sekarang berbiaya nol.

**Konsekuensi:** setiap modul bisnis menulis `organization_id`; nilainya berasal dari
context server, tidak pernah dari input klien.

**Alternatif ditolak:** menambah kolom saat sudah dibutuhkan.
