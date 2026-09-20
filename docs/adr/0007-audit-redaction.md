# ADR-0007 — Audit redaction: allowlist per entitas, default tolak

**Status:** Diterima

## Keputusan

Audit menyimpan snapshot `before`/`after`. Kalau diambil mentah, tabel audit menjadi
salinan kedua `password_hash`, token reset, dan PII.

Aturan: setiap entitas punya daftar field `auditable`; field di luar daftar tidak
disimpan (default tolak). Field bertipe secret, token, hash, atau PII selalu dibuang
walaupun terdaftar — ditegakkan satu fungsi terpusat, bukan disiplin per modul.

**Konsekuensi:** satu file policy audit per modul; operator menyetujui aturan default,
bukan memutuskan per field.

**Alternatif ditolak:** snapshot mentah.
