---
name: database-drizzle
description: Use when writing Drizzle queries, migrations, or seed data in platform/database or any module. Menjaga satu dialek Postgres untuk dua driver.
---

# Database & Drizzle

Satu dialek Postgres, dua driver: `pglite` untuk dev/test, `postgres` untuk produksi.
Modul hanya melihat objek `db`; driver dipilih di `platform/database/index.ts`.

## Aturan

- Tidak ada dua set migrasi. PGlite menjalankan SQL yang sama.
- UUID: `uuidv7()` dari Postgres — time-ordered, tanpa dependency tambahan.
- Batas transaksi ada di service, bukan di route.
- Cek dulu sebelum insert untuk pesan error yang jelas; unique index tetap penjaga terakhir.
- Seed hanya berisi data infrastruktur. Jangan pernah menanam data bisnis karangan.
- Migrasi idempotent: aman dijalankan berulang, tercatat di `_migrations`.
