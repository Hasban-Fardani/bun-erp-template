---
name: module-development
description: Use when adding or changing a business module in apps/server/modules. Menjaga pola schema-data-service-policy-route tetap seragam.
---

# Module development

Modul baru meniru `apps/server/modules/departments` — tidak ada generator ajaib,
tidak ada lapisan tambahan.

## Urutan kerja

1. `schema.ts` — kontrak Zod. Definisikan schema mentah, kompilasi sekali dengan
   `z.compile()` di module scope. Jangan parse di dalam handler.
2. `data.ts` — tabel Drizzle. Selalu sertakan `organization_id`, `created_at`, `updated_at`.
3. Migrasi SQL di `apps/server/migrations/` dengan nama `NNNN_snake_case.sql`.
   Forward-only; perbaikan lewat file baru, bukan edit file lama.
4. `service.ts` — business logic dan batas transaksi. Terima `(db, organizationId, input)`.
5. `policy.ts` — authorization per aksi. Belum punya policy = `denyByDefault`, bukan terbuka.
6. `route.ts` — HTTP tipis: validasi, policy, service, envelope. Tidak ada logic di sini.
7. Daftarkan route di `apps/server/http/routes.ts`.
8. Test di `apps/server/tests/<modul>.test.ts`.

## Jebakan yang sudah terbukti

- `db.execute()` mengembalikan array di postgres-js, tetapi `{ rows }` di PGlite.
  Pakai helper `rowsOf()`.
- `organization_id` tidak pernah berasal dari input klien.
- Duplikat kode unik = 409 `CONFLICT`, bukan 422.
- Entitas tidak ditemukan = 404, bukan 403.
