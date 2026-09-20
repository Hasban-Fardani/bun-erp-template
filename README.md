# Bun ERP Template

Starter aplikasi internal berbasis Bun + TypeScript. Full TypeScript dari web sampai worker,
modular monolith, konvensi yang terasa dekat dengan Laravel tetapi tetap eksplisit.

**Ini bukan ERP siap pakai.** Ini fondasi. Modul bisnis (absensi, payroll, inventory,
procurement, CRM) dibuat dari product spec terpisah.

## Status

Phase 1 — fondasi backend + satu shell web. Lihat `docs/tasks/` untuk status per task.

## Tiga perintah

```bash
cp .env.example .env
bun install
bun erp db:migrate && bun erp db:seed && bun erp dev
```

Pemeriksaan lengkap: `bun erp doctor`.

## Yang sudah ada

- **Config** — satu pembaca `Bun.env`, schema Zod dikompilasi, `env:list` tanpa membocorkan rahasia
- **Database** — Postgres 16+, satu objek `db` untuk dua driver (`pglite` dev/test, `postgres` produksi)
- **HTTP** — Hono, `X-Request-Id`, error envelope tunggal, `/health` dan `/ready`
- **Modul referensi** — `departments`, pola yang ditiru modul lain
- **CLI** — `bun erp <command>`: dev, check, test, doctor, db:migrate, db:seed, route:list, env:list
- **Gate** — `check:scope`, `check:task`, `check:skills` menjaga batas template dan kejujuran status
- **Dokumentasi** — `docs/`, plus `AGENTS.md` untuk agent

## Yang belum ada (sengaja)

Auth/RBAC, queue, notification, storage, reporting, AI ops. Setiap lapisan ditambahkan ketika
ada consumer nyata, bukan untuk kebutuhan hipotetis.

## Stack

Bun 1.4.2 · TypeScript · Hono · Zod 4 · Drizzle ORM · PostgreSQL 16+ · Pino · Biome · React 19 + Vite + Tailwind v4

## Lisensi

MIT.
