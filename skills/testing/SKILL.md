---
name: testing
description: Use when writing tests with bun:test or debugging failures in apps/server/tests. Menjamin kontrak diuji, bukan asumsi.
---

# Testing

`bun:test`. Tidak ada framework tambahan, tidak ada mock berat.

## Aturan

- Setiap test file memakai context sendiri dari `tests/helpers.ts` (PGlite `memory://`).
- Panggil `truncateAll` di awal test supaya tidak bergantung urutan.
- Test HTTP lewat `app.request()` — tidak membuka port.
- Buktikan kegagalan dulu (RED) sebelum patch, lalu perbaikan (GREEN).
- Klaim hanya sebatas yang dijalankan: 200 di test tidak membuktikan UI render.
- Parity compiled vs uncompiled wajib saat mengubah schema Zod.
