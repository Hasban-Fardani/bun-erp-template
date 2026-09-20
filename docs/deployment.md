# Deployment

Satu artifact, dua cara menjalankan.

- Bare metal: `bun erp db:migrate && bun apps/server/server.ts`, unit systemd.
- Docker: image yang sama, perintah sama, `.env` disuntik dari luar image.

Checklist sebelum rilis: `bun erp check`, `bun erp test`, jalankan `db:migrate`,
pastikan `APP_ENV=production` lolos guard, catat `APP_RELEASE`, siapkan jalur rollback.
