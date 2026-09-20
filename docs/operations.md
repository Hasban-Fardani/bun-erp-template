# Operasi

- Log JSON ke stdout (dikelola journald/Docker). Driver `daily` hanya untuk bare metal.
- Hanya request gagal atau lebih lambat dari 1 detik yang dicatat, dengan `trace_id`.
- `/health` = proses hidup. `/ready` = database benar-benar menjawab.
- Migrasi dijalankan saat bootstrap; idempotent dan tercatat di `_migrations`.
- `APP_RELEASE` ikut di setiap baris log supaya rilis bisa diidentifikasi.
