# ADR-0011 — Deployment: hybrid (web statis di Cloudflare, API portabel)

**Status:** Diterima

## Konteks

VPS 4 GB ini menghosting beberapa aplikasi sekaligus dan bisa penuh. Owner ingin beban
dikurangi tanpa mengunci template ke satu vendor, dan tanpa aplikasi rusak ketika
satu saat dipindah server.

## Keputusan

1. **Frontend statis (`apps/web`) dideploy ke Cloudflare** (Pages/Workers Assets).
   Ia tidak menghitung resource VPS.
2. **API (`apps/server`) tetap portabel**: satu artifact yang sama harus jalan di
   VPS mana pun dan, kelak, di Cloudflare Workers bila diperlukan. Vendor VPS tidak
   boleh menjadi ketergantungan.
3. **Aturan portabilitas API** (yang membuat pindah tidak merusak):
   - state hidup di Postgres + object storage, TIDAK di disk lokal aplikasi;
   - konfigurasi hanya lewat env (`.env` / secret deployment), tanpa file path yang
     diasumsikan ada;
   - `LOG_DRIVER=console` default untuk deployment container/Workers; `daily`
     hanya untuk bare metal;
   - entrypoint terpisah dari app: `server.ts` (Bun.serve) dan adaptor lain
     mengimpor `createApp()` yang sama;
   - migrasi dijalankan dari luar (CI/CLI) ke database remote, bukan service yang
     menulis disk sendiri.
4. **Queue/cache (Phase 3)** dipilih saat pemakaiannya nyata, dengan catatan: BullMQ +
   Valkey hanya sah di mode VPS. Bila API berpindah ke Workers, queue memakai
   Cloudflare Queues/Durable Objects. Modul bisnis wajib memanggil interface queue,
   bukan BullMQ langsung, agar dua mode itu bisa ditukar.

## Konsekuensi

- VPS ini tidak lagi diasumsikan rumah abadi: pindah server = tarik artifact + isi env
  + `db:migrate` + nyalakan. Tidak ada backfill disk.
- Postgres tetap boleh di VPS (via Cloudflare Tunnel + Hyperdrive bila API sudah di
  Workers) atau pindah ke Postgres terkelola; keduanya tidak mengubah kode.
- ADR-0006 tetap sah untuk profil resource saat berjalan di VPS; ADR ini mengatur
  *ke mana* ia bisa pindah.

**Alternatif ditolak:** full Workers sekarang (queue + log harus ditulis ulang, padahal
belum dibutuhkan); VPS-only (menolak hemat resource yang diminta owner).
