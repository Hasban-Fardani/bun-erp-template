# ADR-0002 — Message broker: Valkey

**Status:** Diterima

## Keputusan

Drop-in kompatibel protokol Redis sehingga BullMQ dan cache berjalan tanpa ubah kode.
Lisensi BSD-3 dan governance Linux Foundation (AWS/Google/Oracle) — aman untuk template
yang mungkin dijual atau dilisensikan ulang. Redis 8 kembali ke AGPLv3; tidak ada alasan
memilih Redis-only.

**Konsekuensi:** nama env tetap `REDIS_URL` (protokol sama); image yang dipakai `valkey`.

**Alternatif ditolak:** Redis 7/8.
