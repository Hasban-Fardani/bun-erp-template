# Riset: 19 utilitas Metronic vs Web Platform API native

Tanggal riset: 2026-09-23. Lingkup: `/root/bun-erp-template` (Bun + Hono + Drizzle + React 19 + Tailwind v4).
Status: **riset saja. Tidak ada file kode yang diubah.**

## Cara verifikasi (dapat diulang)

| Bukti | Sumber / perintah |
|---|---|
| Dokumentasi resmi Metronic | `curl -sL 'https://preview.keenthemes.com/html/metronic/docs/?page=forms/<slug>'` (19 halaman, semua 200, tanpa login) |
| Ukuran library | `curl -sL <cdn.jsdelivr.net> -o x && gzip -9 -c x \| wc -c` (angka gzip di bawah = transfer nyata) |
| Dependency & tanggal rilis | `https://registry.npmjs.org/<pkg>` → `dist-tags.latest`, `dependencies`, `time[lv]` |
| Dukungan native | MDN: `field-sizing`, `HTMLInputElement.showPicker`, `Clipboard.writeText`, `:user-invalid`, Popover API, `DataTransferItem.webkitGetAsEntry`, Constraint Validation |

Catatan penting temuan #1: **"Exclusive" bukan utilitas.** Di docs Metronic, "Exclusive" adalah badge UI (`class="badge badge-exclusive"`, tooltip `title="In-house component"`) yang menandai komponen buatan KeenThemes sendiri (Dialer, Image Input, Password Meter, BlockUI, Drawer, Stepper, dst). Tidak ada halaman `page=forms/exclusive` — halaman itu 404/redirect. Jadi daftar riil = 19 baris tabel di bawah, tetapi "Exclusive" dinilai sebagai metadata dokumentasi, bukan plugin.

## Tabel penilaian

Biaya = ukuran gzip terukur (JS + CSS) pada 2026-09-23, plus dependency terbawa.

| Utilitas | Masalah | Padanan native (ya/tidak + nama API) | Biaya | Nilai untuk ERP | Rekomendasi | Alasan |
|---|---|---|---|---|---|---|
| **Autosize** | `<textarea>` tidak tumbuh mengikuti isi | **Ya** — `field-sizing: content` (Baseline 2026: Chrome 123, Edge 123, Firefox 152, Safari 26.2) | 1.1 kB, 0 deps | Rendah (textarea catatan/deskripsi) | **TOLAK** | Satu baris CSS menggantikan seluruh library. Sisa gap hanya Firefox <152; cukup `rows` sebagai fallback. |
| **Bootstrap Maxlength** | Umpan balik sisa karakter terhadap `maxlength` | **Ya** — atribut `maxlength` + `input` event untuk counter (≈5 baris) | 2.1 kB + peer `jquery ^3.7.1` + `bootstrap ^5.3.3` | Rendah | **TOLAK** | Batas karakter sudah ditegakkan browser; sisa kebutuhan hanya teks "sisa N", tidak butuh jQuery+Bootstrap di stack ini. |
| **Clipboard** | Salin ke clipboard lintas browser | **Ya** — `navigator.clipboard.writeText()`; `write()` untuk `ClipboardItem` (gambar) | 3.2 kB + 3 deps (`good-listener`, `select`, `tiny-emitter`) | Sedang (copy ID, token, rekening) | **TOLAK** | Baseline "widely available" sejak Maret 2020, aman di semua target. Syarat: HTTPS (secure context) — terpenuhi di deployment template. Panggil dari klik user (transient activation). |
| **Tempus Dominus Datepicker** | Pilih tanggal+jam, aturan disable, format | **Sebagian** — `<input type="date">`, `type="time"`, `type="datetime-local"`; `input.showPicker()` (Baseline sejak Sep 2022) | 19.6 kB JS + 3.6 kB CSS, peer `@popperjs/core ^2.11.6` | Sedang | **TOLAK** | Tumpang tindih penuh dengan Flatpickr; lebih berat, dan menambah peer popper. Kalau picker kustom benar-benar dibutuhkan, pilih satu saja (lihat Flatpickr). |
| **Flatpickr** | Picker tanggal dengan format/aturan/rentang yang tidak bisa diketik bebas | **Sebagian** — native tidak punya kontrol format input, tidak bisa disable hari tertentu, tidak ada mode rentang | 14.4 kB JS + 3.0 kB CSS, **0 dependency** | Sedang–tinggi | **ADOPSI DENGAN SYARAT** | Syarat: adopsi hanya jika muncul kebutuhan (a) rentang tanggal, (b) aturan disable (mis. akhir pekan), (c) format terkontrol saat diketik. Mode `range` + `disable` + `altInput` tidak ada padanan native. Pilih ini, bukan Tempus Dominus/Daterangepicker. Batas: rilis terakhir 2022-04-14 (stabil-tapi-lama) → jangan harap perbaikan bug baru. |
| **Date Range Picker** | Rentang tanggal + preset "30 hari terakhir" | **Sebagian** — dua `input[type=date]` + preset sebagai tombol | 7.5 kB JS + 1.7 kB CSS + `jquery >=1.10` (27.4 kB) + `moment ^2.9` (18.7 kB) | Sedang | **TOLAK** | Total ~55 kB gzip untuk fitur yang intinya dua input. Rilis terakhir 2020-05-24, dan `moment` bersifat legacy/maintenance-only. Preset bisa ditulis ~20 baris dengan `Intl`/`Date`. |
| **Dialer** | Stepper angka min/max/step + prefix mata uang | **Ya** — `input[type=number]` (`min`, `max`, `step`) + dua `button` | 0 (in-house Metronic, tidak bisa dipakai di luar lisensi) | Sedang | **TOLAK** | Yang tidak native hanya format `Rp 1.234.567` → diselesaikan oleh primitive `MaskedInput` (lihat Inputmask), bukan library stepper. |
| **"Exclusive"** | — | — | — | — | **TOLAK (bukan utilitas)** | Bukti: `grep -oE 'badge badge-exclusive'` → 27 kemunculan, semuanya badge menu dengan tooltip "In-house component"; `page=forms/exclusive` tidak ada. Ini label dokumentasi, bukan plugin. |
| **DropzoneJS** | Antrean upload drag-drop, progres, batas jumlah/ukuran | **Ya** — `dragenter/dragover/drop` + `DataTransfer.files`, `DataTransferItem.webkitGetAsEntry()` (folder), `input[type=file]` `multiple`/`accept`, `XMLHttpRequest.upload.onprogress` (atau `fetch` + stream) | 11.8 kB JS + 1.5 kB CSS, 0 deps | Tinggi (lampiran) | **ADOPSI DENGAN SYARAT** | Default TOLAK: drop area + daftar file + progres ≈ 120 baris, tanpa dependency. Syarat adopsi eksplisit dan dapat diuji: **(a)** upload resumable/chunked, **(b)** berkas >~50 MB, **(c)** drop direktori. Ketiganya belum ada di template ini dan butuh dukungan server dulu. |
| **FormValidation** | Validasi form, pesan error per field | **Ya + sudah ada** — Constraint Validation API (`required`, `pattern`, `minlength`, `setCustomValidity`, `reportValidity`) + CSS `:user-invalid` (Baseline sejak Nov 2023) + `zod 4.6.5` yang sudah jadi dependency | Perlu cek per-framework; `@form-validation/core` rilis terakhir 2023-06-18 | Tinggi | **TOLAK** | Repo sudah menggabungkan validasi klien+server lewat satu schema `zod`; menambah FormValidation = sumber kebenaran kedua yang bisa berbeda dari validasi Hono. Pesan error ditulis sendiri, bahasa Indonesia, konsisten. |
| **Form Repeater** | Grup input yang bisa ditambah/hapus | **Ya** — `<template>` + array state React (`useFieldArray`-pola manual) | 0 dep (skrip Metronic terpisah, jQuery) | Sedang–tinggi (baris invoice/BOQ) | **TOLAK** | Di React, daftar yang bisa ditambah/hapus adalah `useState<T[]>` + `map`. Plugin berbasis jQuery akan mengelola DOM sendiri dan bertabrakan dengan state React. |
| **Image Input** | Avatar: pratinjau, ganti, batal, hapus | **Ya** — `input[type=file] accept="image/*"` + `URL.createObjectURL()` (+ `revokeObjectURL`) | 0 (in-house) | Sedang | **TOLAK** | Pola native + satu komponen ~40 baris. Tambahan yang layak: validasi tipe/ukuran sebelum upload (server tetap sumber kebenaran). |
| **Inputmask** | Mask ketik: mata uang, NIK/NPWP, telepon | **Tidak** — `inputmode="numeric"`, `type="number"`, `pattern`, dan `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" })` bisa memformat, tapi **tidak ada mask saat mengetik** | `inputmask` **54.8 kB** gzip; `imask` **15.7 kB** gzip (+`@babel/runtime-corejs3`) | **Tinggi** (IDR, NIK, NPWP, nomor HP, rekening bank) | **ADOPSI DENGAN SYARAT** | Ini satu-satunya celah asli tanpa padanan native penuh. Urutan keputusan: (1) `MaskedInput` sendiri untuk **mata uang IDR** (`Intl.NumberFormat` + `beforeinput`, ±30 baris) — cukup untuk mayoritas ERP; (2) jika pola bertambah >3 keluarga (NIK 16, NPWP, HP +62, SKU), adopsi **`imask`**, bukan `inputmask`: 3.5× lebih kecil (15.7 vs 54.8 kB), API TypeScript-first, vanilla (tanpa jQuery). Server tetap memvalidasi dengan `zod` sebagai batas akhir. |
| **Multiselectsplitter** | `<select multiple>` ber-`optgroup` jadi dua select bertingkat | **Ya** — `<optgroup>` + dua `<select>` + `datalist` | 0 dep (jQuery) | Rendah | **TOLAK** | Fitur ini hanya pemindah pilihan antar dua kotak; pada React = dua `<select>` + state. Plugin memaksa tiap `<option>` ber-`value` unik dan mengelola DOM sendiri. |
| **noUiSlider** | Slider rentang angka | **Ya** — `<input type="range">` (`min`/`max`/`step`) dengan styling `accent-color` | 9.4 kB JS + 1.2 kB CSS | Rendah | **TOLAK** | Filter ERP hampir selalu butuh angka eksak (min/max nominal), bukan slider. Slider ganda pun tidak native, tetapi dua input angka lebih akurat dan bisa di-bookmark di URL (lihat `useTableState`). |
| **Password Meter** | Indikator kekuatan password saat mengetik | **Sebagian** — `minlength`, `pattern`, `:user-invalid`; tidak ada API skor kekuatan native | 0 (in-house); alternatif `@zxcvbn-ts/core` 24.4 kB | Rendah–sedang | **TOLAK** | Rekomendasi panduan NIST SP 800-63B: panjang minimum + cek daftar password bocor, bukan aturan komposisi/meteran visual. Ganti dengan aturan **server-side**: `minlength` 12 + tolak password umum + (opsional) cek k-anonymity. Ini juga menutup jalur API langsung, yang tidak lewat UI. |
| **reCAPTCHA** | Anti-bot pada form publik | **Tidak ada padanan native** | 0 npm, tapi 1 skrip pihak ketiga dari `google.com` + kirim data ke Google | Rendah (admin internal, sudah di balik login) | **TOLAK** | Ini aplikasi admin internal ber-RBAC; permukaan penyalahgunaan utamanya login. Pertahanan berurutan: rate limit + audit (sudah ada di `docs/security.md`) lalu, bila perlu saja, Cloudflare Turnstile — sejalan ADR-0011 (web statis di Cloudflare), tanpa menambah SDK npm. reCAPTCHA v3 tanpa skor-threshold server-side nyaris tidak berguna. |
| **Select2** | Select dengan pencarian, multi, data remote, tag | **Sebagian** — `<datalist>` + `showPicker()` memberi saran, tetapi **tidak** untuk remote search ter-paginasi dari 10k+ baris | 19.9 kB JS + 2.2 kB CSS, berbasis jQuery (peer tidak dideklarasikan) + 27.4 kB jQuery | Tinggi (pilih karyawan/produk/akun dari tabel besar) | **TOLAK** | Dua alasan: (a) Select2 mengelola DOM imperatif → dua sumber kebenaran dengan React 19; (b) ukurannya ~47 kB bersama jQuery. Padanan React-nya: satu komponen `Combobox` di atas Radix yang sudah ada (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`) + TanStack Query untuk pencarian remote — biaya ~11 kB gzip per Radix primitive sebagai pembanding internal. Tambah `@radix-ui/react-popover` hanya bila perlu anchor mengambang. |
| **Tagify** | Input tag/chip: pisah dengan koma, dedup, validasi, paste | **Tidak** — tidak ada elemen tag native | 20.8 kB JS + 3.0 kB CSS | Sedang (label, role, penanda) | **TOLAK** | Chip input = array of string + `Badge` yang sudah ada di `shared/ui/primitives.tsx` + handler `Enter`/`,`/paste: ±40 baris. Kalau butuh saran/whitelist, komponennya sama dengan `Combobox` — tidak perlu library terpisah. |

## Maksimal 5 yang paling valuable — urut prioritas

Default repo adalah TOLAK bila native cukup (AGENTS.md §5), jadi hanya 2 dari 5 yang berupa dependency; sisanya primitive internal.

1. **MaskedInput — mata uang/ID (Inputmask, ADOPSI DENGAN SYARAT).** Satu-satunya celah yang benar-benar tidak native. Padanan native: `inputmode="numeric"` + `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" })` (tidak ada mask saat mengetik). Bangun satu komponen; adopsi `imask` (15.7 kB) hanya saat pola >3 keluarga. Tolak `inputmask` (54.8 kB, 3.5×).
2. **Combobox — pencarian remote (menyerap Select2 + Tagify + Multiselectsplitter).** Padanan native: `<datalist>` + `showPicker()` — tidak cukup untuk remote search ter-paginasi. Bangun di atas Radix yang sudah ada + TanStack Query. Tolak Select2 (jQuery, 19.9 kB + 27.4 kB) dan Tagify (20.8 kB).
3. **Upload primitive — drag-drop + progres (menyerap DropzoneJS, ADOPSI DENGAN SYARAT).** Padanan native: `dragover`/`drop` + `DataTransferItem.webkitGetAsEntry()` (folder) + `input[type=file]` + `XMLHttpRequest.upload.onprogress`. Adopsi Dropzone hanya bila muncul kebutuhan resumable/chunked/>50 MB.
4. **Date input + filter periode (menyerap Flatpickr/Tempus Dominus/Daterangepicker, ADOPSI DENGAN SYARAT).** Padanan native: `input[type=date]`/`datetime-local` + `showPicker()`, preset rentang sebagai tombol. Adopsi **Flatpickr 4.6.13** saja (0 dependency, 17.4 kB gzip total) bila butuh mode rentang / aturan disable / format terkontrol. Tolak Tempus Dominus (peer popper) dan Daterangepicker (jQuery+moment, mati sejak 2020).
5. **Chip input (menyerap Tagify).** Tidak ada padanan native; ±40 baris di React memakai `Badge` + `IconButton` yang sudah ada (`shared/ui/primitives.tsx`).

Pelengkap non-UI: **kebijakan password server-side** menggantikan Password Meter (panjang + daftar tidak-boleh + rate limit), karena aturan klien bisa dilewati lewat pemanggilan API langsung.

## Daftar TOLAK + padanan native-nya

| Ditolak | Padanan native |
|---|---|
| Autosize | `field-sizing: content` |
| Bootstrap Maxlength | `maxlength` + counter `input` event |
| Clipboard | `navigator.clipboard.writeText()` |
| Tempus Dominus | `input[type=date]` / `datetime-local` + `showPicker()` |
| Date Range Picker | dua `input[type=date]` + tombol preset |
| Dialer | `input[type=number]` (`min`/`max`/`step`) + 2 button |
| "Exclusive" | bukan utilitas (badge dokumentasi) |
| FormValidation | Constraint Validation API + `:user-invalid` + `zod 4.6.5` (sudah ada) |
| Form Repeater | `<template>` + array state React |
| Image Input | `input[type=file]` + `URL.createObjectURL()` |
| Multiselectsplitter | `<optgroup>` + dua `<select>` |
| noUiSlider | `input[type=range]` |
| Password Meter | `minlength`/`pattern` + kebijakan server-side |
| reCAPTCHA | rate limit + audit (Turnstile hanya bila publik) |
| Select2 | `<datalist>` + `showPicker()` (kompleks → `Combobox` internal) |
| Tagify | chip input ±40 baris |
| inputmask (varian berat) | ganti ke `imask` bilamana mask memang diperlukan |

## Catatan eksekusi untuk penerapan nanti

- Semua native di atas butuh HTTPS/secure context (Clipboard) dan **transient activation** (klik) untuk `showPicker()` — jangan panggil dari `useEffect`.
- Celah dukungan yang tersisa dan harus diingat: `datetime-local` **tidak punya picker di Safari iOS**, `input[type=time]` tidak di Firefox, `input[type=week]` tidak di Firefox/Safari. Untuk modul lapangan (mobile), uji ulang sebelum mengandalkan murni native.
- Kalau rekomendasi ini dieksekusi, keputusan "picker tanggal = native, Flatpickr hanya bila..." selayaknya dicatat sebagai ADR baru (`docs/adr/`) mengikuti pola ADR-0005 dan ADR-0012, supaya tidak diusulkan ulang.

## Evidence — angka mentah

```
Ukuran gzip terukur (2026-09-23, cdn.jsdelivr.net, gzip -9):
autosize 6.0.1              raw=2825    gzip=1088
bootstrap-maxlength 2.0.0   raw=5380    gzip=2121   (peer jquery ^3.7.1, bootstrap ^5.3.3)
clipboard 2.0.11            raw=9160    gzip=3222   (deps good-listener, select, tiny-emitter)
tempus-dominus 6.10.4       raw=86362   gzip=19558  (+css 3635; peer @popperjs/core)
flatpickr 4.6.13            raw=50679   gzip=14377  (+css 3018; 0 deps)
bootstrap-daterangepicker   raw=32924   gzip=7528   (+css 1738; deps jquery, moment)
dropzone 6.3.4              raw=37976   gzip=11799  (+css 1456; 0 deps)
imask 7.6.1                 raw=59248   gzip=15741  (dep @babel/runtime-corejs3)
inputmask 5.0.10            raw=254735  gzip=54806
nouislider 15.8.1           raw=27743   gzip=9357   (+css 1187)
select2 4.1.0               raw=74294   gzip=19942  (+css 2177)
tagify 4.38.0               raw=69105   gzip=20752  (+css 3021)
jquery 4.0.0                raw=78748   gzip=27384
moment 2.30.1               raw=58890   gzip=18719
@zxcvbn-ts/core 4.2.0       raw=107643  gzip=24421
just-validate 4.3.0         raw=29796   gzip=7118
tom-select 2.6.2            raw=51804   gzip=17552
@radix-ui/react-select 2.2.6 raw=54838  gzip=11090  (pembanding internal)

Rilis terakhir (registry.npmjs.org, dist-tags.latest):
autosize 6.0.1 → 2023-02-13          clipboard 2.0.11 → 2022-05-04
tempus-dominus 6.10.4 → 2025-05-07   flatpickr 4.6.13 → 2022-04-14
bootstrap-daterangepicker 3.1.0 → 2020-05-24   dropzone 6.3.4 → 2026-09-16
imask 7.6.1 → 2024-05-21             inputmask 5.0.10 → 2026-07-31
nouislider 15.8.1 → 2024-06-21       select2 4.1.0 → 2026-05-26
tagify 4.38.0 → 2026-06-27           @form-validation/core 2.4.0 → 2023-06-18
bootstrap-maxlength 2.0.0 → 2024-11-03

Dukungan native (MDN):
field-sizing: content  — Baseline 2026; Chrome 123, Edge 123, Firefox 152, Opera 109, Safari 26.2
showPicker()           — Baseline widely available sejak Sep 2022 (Chrome 99, FF 101, Safari 16)
  date input           — full support termasuk Safari 17.4
  datetime-local       — Safari iOS: No support (picker)
  time input           — Firefox: No support
  week input           — Firefox/Safari: No support
clipboard.writeText()  — Baseline widely available sejak Mar 2020; secure context (HTTPS)
:user-invalid          — Baseline widely available sejak Nov 2023
Popover API            — Baseline 2025 (Jan 2025)
webkitGetAsEntry()     — tersedia (nama ber-prefix juga di Firefox)
```

## Yang tidak dilakukan

- Tidak ada perubahan kode, dependency, build, atau `bun erp check`.
- Hanya menulis berkas ini (`/root/bun-erp-template/.riset/metronic-utils.md`).
