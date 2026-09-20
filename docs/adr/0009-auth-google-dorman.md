# ADR-0009 — Auth: email+password, Google OAuth dorman

**Status:** Diterima

## Keputusan

Email+password aktif. Google OAuth terpasang tetapi tidak aktif secara default:
provider hanya diregistrasikan kalau `GOOGLE_CLIENT_ID` **dan** `GOOGLE_CLIENT_SECRET`
terisi. Kalau kosong, tidak ada tombol dan tidak ada route.

**Konsekuensi:** schema Zod kondisional (keduanya opsional, tetapi salah satu terisi
berarti keduanya wajib). Menyalakan OAuth = mengisi env dan restart, bukan menulis kode.
Satu aplikasi memilih satu jalur login — SSO Cloudflare dan OAuth Google tidak dipasang
berdampingan di satu UI.

**Alternatif ditolak:** Google-only, SSO campur.
