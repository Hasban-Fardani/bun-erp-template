# ADR-0010 — Driver database: PGlite (dev/test), PostgreSQL (produksi)

**Status:** Diterima

## Keputusan

`DATABASE_DRIVER=pglite|postgres`. PGlite (Postgres-WASM) untuk development dan test:
tanpa instalasi, dialek identik produksi, tanpa dua set migration. `platform/database`
memilih driver lalu mengekspor satu objek `db` bertipe sama; modul tidak tahu driver
mana yang aktif.

Workflow CI menjalankan suite yang sama atas kedua driver dan migrasi di PostgreSQL 16
dan 18. Keberadaan workflow bukan klaim run pertama GitHub sudah lulus.

UUIDv7: PG16/17 memakai polyfill migrasi 0001, PG18 tetap memakai fungsi native.
Polyfill memakai gen_random_uuid dan timestamp milidetik tanpa extension. UUID dalam satu
milidetik tidak dijanjikan monotonik; timestamp tetap dapat diurutkan.

**Batas:** PGlite single-process — bukan untuk concurrency produksi.

**Konsekuensi:** Postgres 16 self-host sebagai service OS butuh persetujuan owner.

**Alternatif ditolak:** SQLite, satu driver saja.
