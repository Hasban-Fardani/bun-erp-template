# Bun ERP Template

Fondasi aplikasi internal dengan Bun + TypeScript dan modular monolith. Ini template;
modul bisnis dikembangkan dari product spec terpisah.

## Menjalankan lokal

```sh
cp .env.example .env
bun install --frozen-lockfile
bun erp key:generate
bun erp db:migrate
bun erp db:seed
bun erp user:create <email> <password> owner <name>
bun erp dev
```

Web dijalankan terpisah: `bun run --cwd apps/web dev`. Vite mem-proxy `/api` ke API;
`VITE_API_BASE_URL` kosong untuk proxy lokal dan berisi origin API untuk deployment hybrid.
`bun erp --help` adalah daftar perintah yang berlaku.

## Yang tersedia

- Config tervalidasi dan production guard: `apps/server/platform/config/`.
- Satu dialek Postgres: PGlite dev/test, PostgreSQL 16–18 melalui postgres.js di produksi.
  Migrasi 0001 memasang polyfill UUIDv7 pada PG16/17; PG18 memakai fungsi native.
- API Hono dengan request ID, authorization, envelope, health dan readiness: `apps/server/http/`.
- Better Auth email/password dan Google OAuth dorman: `modules/identity/auth.ts`.
- Pengguna, RBAC, audit serta modul acuan departments: `apps/server/modules/`.
- OpenAPI dari route dan Scalar: `/api/openapi.json` dan `/api/docs`.
- Web React: login, pengguna, peran/izin dan audit: `apps/web/src/pages/`.
- Gate kualitas, test PGlite/Postgres dan browser QA: `tools/`, `.github/workflows/ci.yml`.

## Yang belum tersedia

Modul bisnis, queue/worker background, notifikasi, pengiriman email reset password,
implementasi storage, reporting dan AI ops. Konfigurasi untuk kebutuhan berikutnya bukan
bukti fitur sudah diimplementasikan. PostgreSQL tetap satu-satunya dialek.

## Verifikasi

`bun erp check`, `bun erp test`, `bun erp build`, `bun erp doctor`.
Status task dan bukti ada di `docs/tasks/`; hanya manusia menaikkan status ke ready/done.
Keberadaan workflow tidak membuktikan run GitHub maupun branch protection sudah aktif.

## Stack dan lisensi

Bun 1.4.2, TypeScript, Hono, Zod, Drizzle, Pino, React, Vite, Tailwind,
TanStack Router + Query. Versi eksak ada di manifest dan bun.lock. Lisensi MIT.
