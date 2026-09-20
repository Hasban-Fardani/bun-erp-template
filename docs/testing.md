# Testing

Harness `bun:test`. Tidak ada framework tambahan.

- `helpers.ts` menyediakan context uji dengan PGlite `memory://` dan helper `truncateAll`.
- Migrasi dijalankan sekali per test file; setiap test memulai dari database bersih.
- Test HTTP memakai `app.request()` — tidak perlu port terbuka.
- Parity compiled vs uncompiled (F1.16) menjaga `z.compile()` tidak menyimpang dari schema sumber.
- Integrasi Postgres nyata dijalankan di CI, bukan di laptop.

Yang diuji di sini adalah kontrak HTTP, bukan tampilan. UI diuji terpisah saat task web dibuka.
