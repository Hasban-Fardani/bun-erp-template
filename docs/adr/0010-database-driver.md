# ADR-0010 — Driver database: PGlite (dev/test), PostgreSQL (produksi)

**Status:** Diterima

## Keputusan

`DATABASE_DRIVER=pglite|postgres`. PGlite (Postgres-WASM) untuk development dan test:
tanpa instalasi, dialek identik produksi, tanpa dua set migration. `platform/database`
memilih driver lalu mengekspor satu objek `db` bertipe sama; modul tidak tahu driver
mana yang aktif.

Contract test dijalankan atas kedua driver; CI menjalankan test migrasi di Postgres
sungguhan.

**Batas:** PGlite single-process — bukan untuk concurrency produksi.

**Konsekuensi:** Postgres 16 self-host sebagai service OS butuh persetujuan owner.

**Alternatif ditolak:** SQLite, satu driver saja.
