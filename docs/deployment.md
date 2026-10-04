# Deployment

Satu artifact, dua cara menjalankan.

- Bare metal: `bun erp db:migrate && bun apps/server/server.ts`, unit systemd.
- Docker: image yang sama, perintah sama, `.env` disuntik dari luar image.

Checklist sebelum rilis: `bun erp check`, `bun erp test`, jalankan `db:migrate`,
pastikan `APP_ENV=production` lolos guard, catat `APP_RELEASE`, siapkan jalur rollback.

Web disajikan terpisah sesuai ADR-0011; API tidak menyajikan aset web. Untuk VPS gunakan
PostgreSQL 16–18. Migrasi 0001 memasang UUIDv7 hanya pada database baru PG16/17 dan
membiarkan fungsi native PG18. Database yang sudah mencatat 0001 tidak menjalankannya ulang:
periksa fungsi UUIDv7 sebelum memindahkan database lama ke server PG16/17. Jangan menghapus
ledger agar migrasi lama dijalankan ulang.

Audit menolak UPDATE/DELETE melalui trigger migrasi 0006. Akun aplikasi produksi bukan
superuser dan tidak diberi hak TRUNCATE/DDL. Administrator database tetap dapat mengubah
schema; trigger tidak menggantikan kontrol akses database maupun backup.
