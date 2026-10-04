# Arsitektur

## Bentuk repo

```
apps/server/            entrypoint API Bun; background worker belum diimplementasikan
  http/                 Hono: middleware, error envelope, pendaftaran route
  platform/             fondasi lintas modul: config, database, observability
  modules/<nama>/       satu modul = satu domain
    schema.ts           kontrak input (Zod, dikompilasi)
    data.ts             tabel Drizzle
    service.ts          business logic + batas transaksi
    policy.ts           authorization
    route.ts            HTTP tipis
  migrations/           SQL forward-only, berurutan lintas modul
apps/web/               React + Vite, web statis terpisah sesuai ADR-0011
tools/                  CLI `bun erp` dan gate (scope, task, skills)
docs/                   dokumentasi ini
skills/                 instruksi agent
```

## Alur satu request

1. `server.ts` membentuk context, menjalankan migrasi, seed infrastruktur.
2. Web lokal memakai proxy Vite; deployment hybrid memakai origin API dari VITE_API_BASE_URL.
3. Hono memberi `X-Request-Id`, meneruskan ke route.
4. Route memvalidasi input, memanggil policy, lalu service.
5. Service menyentuh `ctx.db` dan mengembalikan data domain.
6. Route membungkus hasil sebagai `{ data, meta: { requestId } }`.
7. Error apa pun menjadi `{ error: { code, message, fields? }, meta }`.

## Batas yang ditegakkan

- Modul tidak mengimpor modul lain secara langsung; lewat service publiknya bila perlu.
- Hanya `platform/config` yang membaca `Bun.env`.
- Tabel bisnis selalu membawa `organization_id`.
- Tidak ada route privat tanpa authorization eksplisit.
