# Arsitektur

## Bentuk repo

```
apps/server/            entrypoint API dan worker (satu aplikasi, dua pintu)
  http/                 Hono: middleware, error envelope, pendaftaran route
  platform/             fondasi lintas modul: config, database, observability
  modules/<nama>/       satu modul = satu domain
    schema.ts           kontrak input (Zod, dikompilasi)
    data.ts             tabel Drizzle
    service.ts          business logic + batas transaksi
    policy.ts           authorization
    route.ts            HTTP tipis
  migrations/           SQL forward-only, berurutan lintas modul
apps/web/               React + Vite, disajikan same-origin
tools/                  CLI `bun erp` dan gate (scope, task, skills)
docs/                   dokumentasi ini
skills/                 instruksi agent
```

## Alur satu request

1. `server.ts` membentuk context, menjalankan migrasi, seed infrastruktur.
2. Hono memberi `X-Request-Id`, meneruskan ke route.
3. Route memvalidasi input, memanggil policy, lalu service.
4. Service menyentuh `ctx.db` dan mengembalikan data domain.
5. Route membungkus hasil sebagai `{ data, meta: { requestId } }`.
6. Error apa pun menjadi `{ error: { code, message, fields? }, meta }`.

## Batas yang ditegakkan

- Modul tidak mengimpor modul lain secara langsung; lewat service publiknya bila perlu.
- Hanya `platform/config` yang membaca `Bun.env`.
- Tabel bisnis selalu membawa `organization_id`.
- Tidak ada route privat tanpa authorization eksplisit.
