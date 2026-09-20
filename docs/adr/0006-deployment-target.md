# ADR-0006 — Target deployment: VPS kecil, budget baseline 2 GB

**Status:** Diterima

## Keputusan

Data VPS ini saat keputusan diambil: RAM 3.6 GB total dengan sekitar 1.5 GB terpakai,
swap 4 GB terpakai sebagian, disk 31 GB dari 59 GB. Sudah berjalan: beberapa aplikasi
internal, gateway, router model, dan satu stack Docker.

Kesimpulan: masih bisa menampung API + worker + Postgres + cache, tetapi profil
**2 GB adalah baseline untuk client dengan budget kecil** — bukan janji bahwa semua
service opsional ikut hidup. Layanan opsional (renderer dokumen, monitoring, AI) mati di
profil kecil.

**Konsekuensi:** menambah Postgres dan cache sebagai service OS butuh persetujuan owner.
