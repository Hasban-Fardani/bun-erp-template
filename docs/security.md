# Security

- Semua route privat wajib auth + authorization eksplisit; `denyByDefault` tersedia untuk aksi
  yang belum punya policy supaya lupa menulis policy menjadi error, bukan lubang terbuka.
- `organization_id` diambil dari context server, bukan dari body/query klien.
- Secret hanya hidup di `.env`; `env:list` menampilkan `set`/`empty`, bukan nilai.
- Redaction log terpusat di `platform/observability/logger.ts`.
- Production menolak konfigurasi tidak aman saat bootstrap (`APP_ENV=production` guard),
  bukan saat request pertama.
