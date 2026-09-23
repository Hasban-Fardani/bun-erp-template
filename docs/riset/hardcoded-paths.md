# Hardcode spesifik-server di repo template

Riset: 2026-09-23. Metode: `git grep` pada file terlacak + inventaris file untracked yang terbawa
saat repo disalin (`cp -r` / zip / tar), bukan hanya `git clone`.
Commit dasar: `c259d89` (branch `master`). Total file terlacak: **165**.

Pertanyaan yang dijawab: nilai mana di repo ini yang hanya valid di VPS pemilik, dan apa yang
rusak di server orang yang menyalin template ini?

---

## Ringkasan

| Tingkat | Jumlah | Inti masalah |
|---|---|---|
| KRITIS | 3 | Gate `bun erp check` mati total di server lain (impor modul dari `/root/programming-governance/`), dan gate readiness **sudah gagal hari ini** di repo ini sendiri |
| SEDANG | 6 | Port 8095 + `/var/log/...` + nama pemilik + inventaris resource VPS ikut tersalin |
| RINGAN | 5 | Path `/tmp` bukti riset, screenshot, statistik VPS di ADR |
| BERSIH | 17 file | `.env.example`, `erp.ts`, `tools/platform.ts`, `bunfig.toml`, dll — lihat bagian akhir |

Dua nilai yang dicari **tidak ada sama sekali** di repo ini (sudah benar):
`/srv/...`, unit `bun-erp-api.service`, hostname `VM-5-202-debian`, port `8090`/`8091`/`20128`/`7777`.

```
$ cd /root/bun-erp-template && git grep -nE 'bun-erp-api\.service|VM-5|20128|7777|8090|8091|/srv/' -- .
$ echo $?
1                      # nol hasil — bersih
```

---

## KRITIS

### 1. `tools/design-gate.ts:5` — impor modul dari home pemilik

```
} from "/root/programming-governance/adapters/design-direction-validator.ts";
```

| | |
|---|---|
| **Bahaya** | KRITIS |
| **Kenapa rusak di server lain** | Ini **static ESM import**, bukan impor relatif. Resolusinya terjadi saat modul dimuat, sebelum baris mana pun dijalankan. Di server lain `/root/programming-governance/` tidak ada (folder itu repo pribadi pemilik, di luar template — terbukti `git -C /root/programming-governance rev-parse --show-toplevel` → `/root/programming-governance`). |
| **Efek nyata** | `tools/design-gate.ts` dipanggil `erp.ts:98` (`await guard("design", () => runGate("design"))`). Impor gagal → `ERR_MODULE_NOT_FOUND` dilempar, **bukan** `GateFailure` → `guard()` melempar ulang → proses mati dengan stack trace. Artinya: **`bun erp check` tidak bisa dijalankan sama sekali** oleh siapa pun yang menyalin template ini. Gate yang justru dijadikan andalan repo ("a rule nothing runs is documentation") membuat seluruh gerbang berhenti. |
| **Bukti (mesin ini)** | `bun -e 'await import("/root/programming-governance/adapters/design-direction-validator.ts")'` → `OK loaded`; file ada (`ls -la` → 17491 byte). Jadi di sini kebetulan hidup, di tempat lain tidak. |
| **Bukti (simulasi server lain)** | Salinan file dengan segmen host diubah: `Cannot find module '/srv/programming-governance/adapters/design-direction-validator.ts' imported from /tmp/gate-fail/dg.ts` |
| **Rekomendasi** | Pindahkan dua adapter ke dalam repo (`tools/vendor/design-direction-validator.ts` + `tools/vendor/slop-validator.ts`, ikut versi di git), lalu impor relatif. Kalau harus tetap opsional: jadikan impor dinamis di dalam `try/catch`, dan kalau tidak ada, **kembalikan temuan `DESIGN_GATE_UNAVAILABLE` ber-severity BLOCKER** — jangan diam. Bungkus dengan env `GOVERNANCE_ADAPTERS_DIR` ber-default `tools/vendor`. |

### 2. `tools/readiness.ts:66` — gate yang melarang domain nyata, tapi memuat domain nyata

```
const suspicious = /<domain-pemilik>|\.web\.id\b/i;
```

| | |
|---|---|
| **Bahaya** | KRITIS |
| **Kenapa rusak di server lain** | Dua kerusakan sekaligus. (a) **Bocor**: nama domain produksi pemilik tertulis di file template publik; regex `<klien>`/`\.web\.id` adalah daftar khas satu deployment, bukan aturan umum. Orang yang menyalin template ini melihatnya sebagai contoh ("oh, pakai domain saya sendiri di sini") — padahal tempatnya salah. (b) **Gate ini gagal hari ini**: `bun erp check:prod` membaca semua file terlacak, menemukan pola itu di file ini sendiri, lalu melaporkan kegagalan tentang dirinya sendiri. |
| **Bukti (dijalankan sekarang)** | Lihat bagian Bukti di bawah: `READINESS_DOMAINS: tools/readiness.ts mentions a real deployment — placeholder the name before publishing`. Skrip `check:prod` exit 1. Jadi `package.json` mendeklarasikan `check:prod` sebagai syarat rilis (`tools/readiness.ts:30` menjadikan `check:prod` wajib ada), tetapi perintah itu **tidak pernah bisa hijau** di repo ini — dan di server lain pemeriksaannya tidak relevan (selalu "lewat" karena hostname mereka bukan `<domain-pemilik>`). Gate readiness dengan demikian mati dua arah. |
| **Rekomendasi** | Hapus daftar domain spesifik dari kode. Ganti dengan aturan generik: tolak TLD/host yang bukan `example.*`/`*.test`/`localhost`, atau baca daftar larangan dari file konfigurasi deployment (`.scope.local.json`, di-gitignore) ber-default kosong. Setelah itu `check:prod` bisa hijau di repo bersih dan di salinan siapa pun. |

### 3. `tools/slop.ts:49` — jalur yang sama, tapi gagal secara senyap

```
const validator = "/root/programming-governance/adapters/slop-validator.ts";
if (!(await Bun.file(validator).exists())) return [];
```

| | |
|---|---|
| **Bahaya** | KRITIS |
| **Kenapa rusak di server lain** | Berbeda dari design-gate, di sini ada penjaga `exists()` — jadi tidak crash. Itu justru lebih berbahaya: di server lain validator tidak ada → fungsi mengembalikan `[]` → **setengah dari gate slop hilang tanpa satu pun peringatan**. Komentar di `tools/slop.ts:44-46` menyatakan perannya: "catches cross-file patterns (passthrough, unused export, duplicates) that need an AST". Keseluruhan kelas temuan itu lenyap, dan output gate berbunyi seolah semuanya bersih. Salinan template juga membawa path `/root/...` yang menunjuk ke luar repo — kode yang seharusnya tidak pernah dimiliki template publik. |
| **Bukti** | Jalur itu tidak ada di server lain; `Bun.file(...).exists()` → `false` → `return []` (baris 50). Di mesin ini: `exists: true`, jadi temuan AST memang keluar di sini dan hanya di sini. |
| **Rekomendasi** | Sama seperti #1: vendor adapter ke dalam repo + impor relatif. Kalau tetap opsional, wajibkan gate mengeluarkan satu temuan eksplisit berisi "kuat-verifikasi AST dilewati: validator tidak ditemukan pada <path>" supaya kondisi senyap tidak mungkin terjadi. Jangan pernah `return []` tanpa jejak. |

---

## SEDANG

### 4. `apps/server/tests/schema-parity.test.ts:96` dan `:123` — port produksi pemilik

```
      APP_PORT: "8095",
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | Skema menerima port apa pun 1–65535 (`apps/server/platform/config/schema.ts:32`), jadi tesnya **lolos** — bukan gagal, tapi bocor. `8095` adalah port spesifik VPS pemilik; tertulis dua kali di dalam fixture "deployment hybrid" sebagai contoh port produksi. Orang lain yang menyalin akan menganggap 8095 adalah port yang diharapkan template, lalu mendaftarkan reverse-proxy/firewall mereka ke port itu. Port bukan bagian dari keputusan arsitektur; ia detail deployment. |
| **Rekomendasi** | Pakai port netral (`"3000"`, sudah dipakai baris 161 test yang sama) atau `"443"`. Kalau tes memang perlu membuktikan port non-standar diterima, ambil nilai dari variabel bernama jelas (`const TEST_PORT = 8095` tidak lebih baik) — yang benar: pakai `3000` dan biarkan komentar menjelaskan bahwa rentangnya 1–65535 sudah diuji oleh skema. |

### 5. `apps/server/tests/schema-parity.test.ts:101, 128, 157` — jalur log absolut produksi

```
      LOG_PATH: "/var/log/bun-erp/app.log",
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | `logger.ts:29-31` mewajibkan `LOG_PATH` absolut saat `LOG_DRIVER=daily`, dan tes ini memakai `/var/log/bun-erp/app.log` seolah itu default yang wajar. Di server lain `/var/log/bun-erp/` tidak ada dan biasanya tidak boleh ditulis tanpa `root`/`systemd` unit tersendiri. Salinan template membawa asumsi direktori log milik VPS ini; operator baru mengetiknya apa adanya lalu `pino` gagal membuat direktori (atau membuatnya sebagai root). Bandingkan `.env.example:13` yang sudah benar (`.data/logs/app.log`) — jadi nilai ini hanya muncul di tes. |
| **Rekomendasi** | Pakai jalur relatif yang netral di fixture, mis. `"/tmp/bun-erp-test/app.log"` (tetap absolut, memenuhi aturan logger, tapi tidak mengasumsikan `/var/log` milik siapa pun). Baris komentar `.env.example:12` boleh tetap ada sebagai *contoh* yang diberi label jelas (sudah diberi label — aman). |

### 6. `LICENSE:3` — identitas pemilik sebagai pemegang hak cipta

```
Copyright (c) 2026 <pemilik> Fardani
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | Ini bukan path atau port, tapi nilai paling spesifik-instance di seluruh repo. Template yang disalin orang lain akan menyatakan kode *mereka* milik pemilik template, atau (lebih buruk) mereka akan menghapusnya tanpa tahu apakah lisensinya memperbolehkan. Selain itu ada cacat gate yang terbukti: pola `client-name` di `template.scope.json:18` memuat `<nama-pemilik>`, dan regex itu **cocok** dengan isi LICENSE — tetapi `tools/scope.ts:56` melakukan `if (!file.includes("/")) continue;`, sehingga **semua file di akar repo dilewati**. |
| **Bukti** | `checkScope(".")` → `findings: 0`. Regex `\b(flora|idar|<klien>|daness|<nama-pemilik>)\b` pada isi LICENSE → `<pemilik>`. `"LICENSE".includes("/")` → `false`. Jadi gate scope memiliki lubang persis sebesar file akar: LICENSE, README.md, AGENTS.md, `.env.example`, `package.json`, `erp.ts`, `template.scope.json` tak pernah diperiksa isinya. |
| **Rekomendasi** | Untuk LICENSE: ganti ke placeholder pemegang hak yang jelas bagi penyalin, mis. `Copyright (c) 2026 <Nama Pemilik Proyek>` dengan instruksi satu baris di README cara mengisinya — atau, sesuai ADR-0008 (distribusi template), nyatakan bahwa setiap salinan wajib mengganti nama itu. Untuk gate: hapus `continue` di `tools/scope.ts:56` dan pindahkan pemeriksaan top-level-dir ke `if (file.includes("/"))`, supaya pemeriksaan pola tetap berjalan pada file akar. |

### 7. `docs/adr/0006-deployment-target.md:7-9` — inventaris perangkat keras VPS ini

```
Data VPS ini saat keputusan diambil: RAM 3.6 GB total dengan sekitar 1.5 GB terpakai,
swap 4 GB terpakai sebagian, disk 31 GB dari 59 GB. Sudah berjalan: beberapa aplikasi
internal, gateway, router model, dan satu stack Docker.
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | ADR adalah dokumen keputusan, dan ADR yang bergantung pada angka resource satu mesin menjadi tidak bisa dipakai ulang: salinan template membawa "RAM 3.6 GB, disk 59 GB, satu stack Docker" sebagai konteks keputusan, padahal di server lain angka itu salah dan mengarahkan pembaca ke kesimpulan yang keliru (`docs/architecture.md` menyuruh membaca `docs/adr/` sebelum mengubah arsitektur — jadi dokumen ini benar-benar dibaca). Membocorkan pula keadaan infrastruktur pemilik (beberapa aplikasi + gateway + router model). |
| **Rekomendasi** | Ganti dengan profil yang dapat dipindah: "profil minimum: 2 GB RAM, 10 GB disk, CPU 2 core"; pindahkan angka spesifik mesin ke berkas deployment yang di-gitignore, atau hapus. ADR-0006 tetap sah tanpa angka mesin. |

### 8. `docs/adr/0011-deployment-hybrid.md:7` dan `:35` — "VPS ini"

```
7: VPS 4 GB ini menghosting beberapa aplikasi sekaligus dan bisa penuh. Owner ingin beban
35:- VPS ini tidak lagi diasumsikan rumah abadi: pindah server = tarik artifact + isi env
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | Baris 35 justru menyatakan tujuannya: "VPS ini tidak lagi diasumsikan rumah abadi" — sementara baris 7 mengasumsikan tepat mesin itu dan ukurannya (4 GB). Di salinan orang lain ADR ini dibaca sebagai deskripsi keadaan mereka, padahal bukan; keputusan yang diambil (web statis + API portabel) tetap benar, konteksnya yang salah alamat. |
| **Rekomendasi** | Ubah bahasa menjadi keputusan berbasis profil: "kontainer/VPS berbagi dengan aplikasi lain berisiko penuh" tanpa angka dan tanpa kata tunjuk "ini". |

### 9. `apps/web/vite.config.ts:6` — port API dev yang tidak berdokumentasi

```
const API_PORT = process.env.API_PORT ?? "3000";
```

| | |
|---|---|
| **Bahaya** | SEDANG |
| **Kenapa rusak di server lain** | Server API memakai `APP_PORT` (`apps/server/server.ts:24`). Web dev memakai `API_PORT` — nama berbeda, tidak ada di `.env.example`, dan hanya muncul di dua baris file ini (`git grep -n API_PORT` → hanya `apps/web/vite.config.ts:6,16`). Siapa pun yang menyalin template, lalu menyetel `APP_PORT=8095` untuk produksi dan menjalankan `bun erp dev`, akan mendapat proxy yang tetap menembak `localhost:3000` → layar login gagal memuat tanpa penjelasan (permintaan `/api/*` di-proxy ke port kosong). Ini jebakan konfigurasi khas "nilai yang seharusnya relatif tapi absolut": port tersembunyi, dua nama untuk satu hal. |
| **Rekomendasi** | Dokumentasikan `API_PORT` di `.env.example` (satu baris komentar di bawah `APP_PORT`), atau lebih baik: pakai `APP_PORT` yang sama supaya web-dev dan API tidak bisa berbeda tanpa disadari. Kalau `API_PORT` dipertahankan, tambahkan pemeriksaan di `bun erp dev`/`doctor` yang membandingkan keduanya. |

---

## RINGAN

### 10. `apps/web/design/login-page.json:52` dan `:72` — bukti di `/tmp` mesin ini

```
          "observed_artifact": "/tmp/erp-web-e2e/login-desktop.png",
```

| | |
|---|---|
| **Bahaya** | RINGAN (kosmetik, tapi menyesatkan) |
| **Kenapa rusak di server lain** | Bukti pengukuran menunjuk berkas di `/tmp` mesin ini. `/tmp/erp-web-e2e/` **ada di sini** (terverifikasi) tetapi tidak pernah ada di server lain, dan bukan berkas repo. Validator hanya menuntut string tidak kosong (`design-direction-validator.ts:240`), jadi spec tetap lolos meski buktinya hilang — padahal justifikasi seluruh gate ini adalah "reference_tfs actually opened and measured". Rincian lain di spec sudah benar: memakai `docs/riset/login-entry-screens.md` (relatif, di dalam repo). |
| **Rekomendasi** | Ganti kedua jalur ke berkas di dalam repo (`docs/riset/login-entry-screens.md` sudah menampung angka 412/44/16 itu), atau tambahkan kolom "cara mereproduksi" dan buang jalur absolut. Kalau bukti gambar memang penting, simpan di `docs/riset/artifacts/` (kecil, ikut versi) alih-alih `/tmp`. |

### 11. `docs/riset/metronic-utils.md:3` dan `:131` — lingkup repo absolut + direktori `.riset` yang tidak ada

```
3:   Tanggal riset: 2026-09-23. Lingkup: `/root/bun-erp-template` (Bun + Hono + Drizzle + React 19 + Tailwind v4).
131: - Hanya menulis berkas ini (`/root/bun-erp-template/.riset/metronic-utils.md`).
```

| | |
|---|---|
| **Bahaya** | RINGAN |
| **Kenapa rusak di server lain** | Baris 3 menyebut jalur absolut instalasi pemilik sebagai "lingkup" riset; baris 131 menyebut berkas di `.riset/` — dan direktori `.riset/` **tidak ada** di repo ini (terverifikasi: `ls -d .riset` → No such file or directory) dan tidak ada di `.gitignore`, jadi pembaca mengira ia kehilangan berkas. Dua jalur yang tidak bisa diverifikasi siapa pun. |
| **Rekomendasi** | Tulis lingkup sebagai "repo `bun-erp-template`" tanpa awalan; perbaiki baris 131 agar menunjuk berkas yang ada (`docs/riset/metronic-utils.md`) atau hapus klaimnya. |

### 12. `docs/riset/ui-tables.md:22-25, 180, 184, 188` — screenshot di `/tmp` mesin ini

```
22: Tangkapan layar (di `/tmp`, di luar repo sesuai batasan penulisan):
23: `/tmp/sspace-tables.png` (galeri), `/tmp/ss-table-01.png` (block Table 01),
24: `/tmp/ss-datatable-01.png` (Datatable 01), `/tmp/ss-table01-mobile.png` (390px),
25: `/tmp/official-datatable.png` (docs resmi), `/tmp/ss-empty.png`.
```

| | |
|---|---|
| **Bahaya** | RINGAN |
| **Kenapa rusak di server lain** | `/tmp` dibersihkan saat reboot dan tidak pernah ada di server lain, jadi enam rujukan bukti visual di dokumen riset mati. Isi dokumennya tetap berguna (angka hasil pengukuran tertulis sebagai teks), jadi ini soal kepercayaan bukti, bukan kegagalan. |
| **Rekomendasi** | Samakan pola dengan berkas riset lain: taruh artefak penting di `docs/riset/artifacts/` atau nyatakan "tangkapan layar tidak disimpan; angka di tabel adalah hasil pengukuran yang bisa diulang dengan perintah di bagian atas". |

### 13. `docs/tasks/F1.17-mastra-smoke.md:17` dan `:44` — `/tmp` sebagai direktori sekali pakai

```
17: Run on Bun 1.4.2 against `@mastra/core` 1.68.0, in a throwaway directory (`/tmp`), never
44: mkdir /tmp/mastra-spike && cd /tmp/mastra-spike
```

| | |
|---|---|
| **Bahaya** | RINGAN |
| **Kenapa rusak di server lain** | Tidak rusak — `/tmp` generik, dan dokumen ini justru membenarkan bahwa eksperimen terjadi di luar repo. Ditemukan saat menyisir `/tmp`; dicatat supaya jelas sudah diperiksa, bukan terlewat. |
| **Rekomendasi** | Tidak ada. Boleh dibiarkan. |

### 14. Artefak untracked yang ikut tersalin — `apps/web/dist/`, `.wrangler/`

Ini bukan baris yang bisa ditunjukkan di dalam file terlacak, tapi temuan paling berbahaya bagi
penyalin yang memakai `cp -r`/zip/tar (bukan `git clone`).

| Artefak | Isi | Bahaya | Kenapa rusak di server lain |
|---|---|---|---|
| `apps/web/dist/assets/index-DeIaZs8N.js` | Bundel produksi dengan `VITE_API_BASE_URL` **tertanam** | KRITIS untuk jalur penyalinan non-git | Bundel berisi literal `https://erp-api.<domain-pemilik>` **dua kali** (terverifikasi di dalam berkas). Siapa pun yang menyalin folder apa adanya lalu menyajikan `dist/` akan mendapat frontend yang memanggil API produksi pemilik — bukan hanya salah, tapi mengirim kredensial pengguna ke domain orang lain. Frontend tidak akan error; ia akan diam dan bicara ke server yang salah. |
| `apps/web/dist/index.html` | HTML jadi yang menunjuk `/assets/index-DeIaZs8N.js` | SEDANG | Terikat nama hash cache-build mesin ini. |
| `.wrangler/` dan `apps/web/.wrangler/` | Dua direktori kosong (hanya `tmp/`) | RINGAN | Jejak tool Cloudflare. **Tidak diabaikan git**: `git check-ignore -v .wrangler apps/web/.wrangler` → kosong (`.gitignore` hanya memuat `node_modules/`, `dist/`, `.data/`, `.env`, `*.log`, `*.tsbuildinfo`). Jadi direktori ini berstatus untracked yang tidak diabaikan — `git add -A` akan memasukkannya. |

**Rekomendasi**
1. Tambahkan ke `.gitignore`: `apps/web/dist/` sudah tercakup `dist/`, tapi `.wrangler/` **belum** — tambahkan `.wrangler/`, `.riset/`.
2. Untuk jalur penyalinan non-git, jadikan pembersihan artefak bagian dari prosedur distribusi: perintah rilis menjalankan `bun erp build` di salinan, bukan menyalin `dist/`. Pertimbangkan `git archive` sebagai satu-satunya cara distribusi (hanya file terlacak yang keluar).
3. Nilai `VITE_API_BASE_URL` tidak boleh pernah terisi domain produksi di berkas yang disimpan; `.env.example:20` sudah benar (`/api/v1`, relatif same-origin). Bahayanya murni dari bundel yang tersisa di disk.

### 15. Working tree yang berubah selama riset (catatan risiko salin)

Saat riset ini berjalan, `git status` berubah lebih dari sekali: semula 5 file termodifikasi +
1 untracked (`apps/web/src/shared/ui/toast.tsx`), kemudian 9 file termodifikasi + 2 untracked
(`toast.tsx`, `apps/server/tests/list-search.test.ts`). Artinya pekerjaan lain sedang berlangsung
di repo yang sama. Isi setiap diff **tidak** memuat path/domain/port spesifik server (diperiksa
dengan memindai baris `+`: `git diff | grep -E '^\+.*(/root|/srv|/tmp|8095|<klien>|web\.id)'` →
kosong), jadi tidak ada temuan baru — tetapi statusnya bergerak.

| | |
|---|---|
| **Bahaya** | SEDANG untuk jalur penyalinan non-git |
| **Kenapa rusak di server lain** | Siapa pun yang menyalin **folder** saat ini menerima pekerjaan setengah selesai (modul yang belum di-commit, berkas baru yang belum masuk git). Hasil `bun erp check` di salinan itu bisa berbeda dari hasil di repo ini, dan tidak ada commit/tag yang bisa dipakai sebagai dasar "template versi ini". Daftar berkas di sini sengaja tidak dijadikan acuan karena sudah berubah sejak dicatat. |
| **Rekomendasi** | Selesaikan dan commit, lalu distribusi hanya dari commit yang dikenal: `git archive <tag>`. Jangan pernah menyalin working tree (`cp -r`/zip/tar) — lihat juga #14 yang menunjukkan jalur salin-folder ikut membawa `dist/` berisi domain produksi. |

---

## Yang sudah BERSIH (jangan diubah)

Diperiksa dan **tidak** memuat path absolut server ini, domain produksi, atau port spesifik:

| File | Kenapa aman |
|---|---|
| `.env.example` | Semua nilai adalah default lokal: `localhost:3000`, `APP_PORT=3000`, `.data/*`. Satu-satunya jalur absolut (`/var/log/bun-erp/app.log`, baris 12) sudah diberi label eksplisit "Bare production path is … — dev default below", artinya contoh, bukan asumsi. Ini adalah rujukan yang benar untuk perbaikan #4/#5. |
| `erp.ts` | Memakai `resolve(import.meta.dir)` (baris 22-25) untuk `repoRoot`, `MIGRATIONS_DIR`, `TASKS_DIR`, `SKILLS_DIR` → portabel. Tidak ada absolut. |
| `tools/platform.ts` | Sudah diperiksa khusus sesuai permintaan: `PATH_ALLOWED` hanya memuat jalur **relatif repo** (`apps/server/...`, `tools/...`, `erp.ts`). Nol absolut. Daftar exempt itu sendiri portabel. |
| `tools/scope.ts`, `tools/copy-guard.ts`, `tools/skills.ts`, `tools/tasks.ts`, `tools/react-doctor.ts` | Semua menerima `root` sebagai argumen (`checkScope(root)`, `join(root, …)`), memakai `Bun.spawn(["git","ls-files"])` dengan `cwd: root`. Nol absolut. |
| `tools/design-gate.ts` (bagian lain) | `join(root, "apps/web/design")` — portabel. (Hanya baris 5 yang bermasalah, lihat #1.) |
| `bunfig.toml` | Hanya `[test] timeout = 30000`. Nol jalur. |
| `package.json`, `apps/server/package.json`, `apps/web/package.json` | Skrip relatif; hanya dependensi. Nol absolut, nol domain. |
| `tsconfig.json`, `biome.json` | Nol `paths`/`include` absolut. |
| `apps/server/platform/config/schema.ts` | Default env relatif atau kosong: `.data/pglite` (baris 46), `.data/storage` (baris 61), `DATABASE_URL=""`. Guard produksi berbasis aturan (https, trusted origins), bukan nama host tertentu. |
| `apps/server/server.ts` | Port dari `ctx.env.APP_PORT`, URL dari `ctx.env.APP_URL`. Nol absolut. |
| `apps/server/tests/helpers.ts` | Fixture memakai `http://localhost:3000` + `.data/logs/test.log` + `memory://` — netral. |
| `apps/web/src/lib/api.ts`, `apps/web/src/config/ui.ts` | Membaca `import.meta.env.VITE_*`, fallback `""` (same-origin) dan `"ERP Template"`. Nol URL tertanam di sumber. |
| `apps/web/vite.config.ts` (selain #9) | Alias `@` dihitung dari `import.meta.dirname`; proxy ke `localhost` + `API_PORT`. Tidak ada host/port server ini. |
| `README.md`, `AGENTS.md` | Nol absolut, nol domain. Struktur repo ditulis relatif. |
| `docs/README.md`, `docs/development.md`, `docs/deployment.md`, `docs/operations.md`, `docs/security.md`, `docs/testing.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/api-contract.md`, `docs/ui-copy.md`, `docs/ui-states.md` | Nol path absolut. Prosedur memakai perintah relatif (`cp .env.example .env`, `bun erp …`). |
| `docs/adr/0001`, `0002`, `0003`, `0004`, `0005`, `0007`, `0008`, `0009`, `0010`, `0012`, `0013`, `README.md` | Nol absolut. (0006 dan 0011 bermasalah — #7, #8.) |
| `skills/**` | Nol absolut. `skills/template-guardrails/SKILL.md:31` menyebut `apps/web/dist/assets/*.css` secara relatif. (Baris 143 menyebut "the governance repo" sebagai narasi, tanpa path — tidak perlu diubah, tapi akan jelas salah setelah #1 diperbaiki dengan vendoring.) |
| `template.scope.json` | Memuat nama klien untuk **dilarang** (`flora|idar|<klien>|daness|<nama-pemilik>`) — itu memang isinya, bukan kebocoran. Nol path/port. |
| `apps/server/tests/*.test.ts` (selain schema-parity) | Nol absolut; `cors-methods.test.ts` memakai `http://localhost:5173` (default Vite), bukan server ini. |
| `apps/web/tests/nav-routes.test.ts`, `sidebar-data.ts`, `route-tree.tsx`, `main.tsx`, `pages/**`, `shared/**` | Nol absolut, nol domain. |
| `bun.lock` | Hanya hash integritas dependensi; tidak ada path/domain. |
| `docs/riset/login-entry-screens.md` | Riset tabel pembanding; nol jalur absolut. Ini rujukan yang benar untuk menggantikan `/tmp/...` di #10. |

---

## Bukti perintah (semua dijalankan di `/root/bun-erp-template`)

```
$ git ls-files | wc -l
165

$ git grep -n "/root/" -- . | grep -v node_modules
tools/design-gate.ts:5:} from "/root/programming-governance/adapters/design-direction-validator.ts";
tools/slop.ts:49:  const validator = "/root/programming-governance/adapters/slop-validator.ts";
docs/riset/metronic-utils.md:3: ... Lingkup: `/root/bun-erp-template` ...
docs/riset/metronic-utils.md:131:- Hanya menulis berkas ini (`/root/bun-erp-template/.riset/metronic-utils.md`).

$ grep -rnE '/root/|/srv/' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
(tidak ada /srv/ sama sekali)

$ git grep -nE '<domain-pemilik>|\.web\.id' -- .
tools/readiness.ts:66:  const suspicious = /<domain-pemilik>|\.web\.id\b/i;

$ git grep -nE '8095|8090|8091|20128|7777' -- .
apps/server/tests/schema-parity.test.ts:96:      APP_PORT: "8095",
apps/server/tests/schema-parity.test.ts:123:      APP_PORT: "8095",
# 8090 / 8091 / 20128 / 7777: nol hasil

$ git grep -nE 'bun-erp-api\.service|VM-5|/srv/' -- .
(nol hasil)

# --- gate readiness gagal pada repo ini sendiri ---
$ bun erp check:prod
readiness failed:
  READINESS_DOMAINS: tools/readiness.ts mentions a real deployment — placeholder the name before publishing
error: script "erp" exited with code 1

# --- bukti impor design-gate hanya hidup karena folder pemilik ada ---
$ bun -e 'await import("/root/programming-governance/adapters/design-direction-validator.ts")'
OK loaded
$ ls -la /root/programming-governance/adapters/design-direction-validator.ts
-rw-r--r-- 1 root root 17491 ... design-direction-validator.ts
$ cp tools/design-gate.ts /tmp/gate-fail/dg.ts && sed -i 's#/root/programming-governance#/srv/programming-governance#' /tmp/gate-fail/dg.ts
$ bun -e 'await import("/tmp/gate-fail/dg.ts")'
FAILURE PROOF: Cannot find module '/srv/programming-governance/adapters/design-direction-validator.ts' imported from /tmp/gate-fail/dg.ts

# --- bukti lubang gate scope pada file akar ---
$ bun -e 'const {checkScope}=await import("./tools/scope.ts"); console.log((await checkScope(".")).length)'
0
$ bun -e 'const s=await Bun.file("template.scope.json").json();
  console.log(new RegExp(s.forbidden.patterns[0].regex, s.forbidden.patterns[0].flags).exec(await Bun.file("LICENSE").text())[0])'
<pemilik>
$ bun -e 'console.log("LICENSE".includes("/"))'
false
# => pola client-name cocok di LICENSE, tetapi scope.ts:56 melewati semua file tanpa "/"

# --- bukti dist membawa domain produksi (salinan non-git) ---
$ grep -c <domain-pemilik> apps/web/dist/assets/index-DeIaZs8N.js
1
$ grep -o 'VITE_API_BASE_URL:[^,]*' apps/web/dist/assets/index-DeIaZs8N.js
VITE_API_BASE_URL:`https://erp-api.<domain-pemilik>`
$ grep -o 'wo=`https[^`]*`' apps/web/dist/assets/index-DeIaZs8N.js
wo=`https://erp-api.<domain-pemilik>`
$ git check-ignore -v apps/web/dist
.gitignore:2:dist/	apps/web/dist
$ git check-ignore -v .wrangler apps/web/.wrangler
(kosong — .wrangler TIDAK diabaikan)

# --- bukti path /tmp pada spec design masih "lolos" validator ---
$ ls /tmp/erp-web-e2e/login-desktop.png      # ada di sini
$ grep -n observed_artifact /root/programming-governance/adapters/design-direction-validator.ts
240: if (!e.observed_artifact || e.observed_artifact.trim().length === 0) {
# hanya menuntut non-kosong; jalur /tmp yang hilang tetap lolos

# --- .env bekerja (tidak terlacak, tidak memuat domain/port server ini) ---
$ git ls-files .env | wc -l
0
$ grep -oE '<domain-pemilik>[a-z.]*|8095' .env
(kosong)
$ grep -oE 'VITE_API_BASE_URL=.*' .env .env.example
.env.example:VITE_API_BASE_URL=/api/v1
.env:VITE_API_BASE_URL=/api/v1
```

---

## Urutan perbaikan yang disarankan

1. **#1 + #3** (satu perubahan, satu penyebab): vendor kedua adapter governance ke `tools/vendor/`, impor relatif, dan ubah `tools/slop.ts:50` supaya ketiadaan validator menjadi temuan eksplisit, bukan `return []`. Setelah ini `bun erp check` hidup di server mana pun.
2. **#2**: ganti daftar domain spesifik di `tools/readiness.ts:66` dengan aturan generik → `bun erp check:prod` akhirnya bisa hijau.
3. **#6**: perbaiki `tools/scope.ts:56` agar file akar ikut diperiksa, lalu putuskan nasib `LICENSE:3` (placeholder + instruksi di README).
4. **#4 + #5 + #9**: netralkan fixture port/jalur log dan dokumentasikan `API_PORT`.
5. **#7 + #8 + #10 + #11 + #12**: bersihkan bahasa ADR dan rujukan `/tmp`.
6. **#14 + #15**: tambahkan `.wrangler/` dan `.riset/` ke `.gitignore`, lalu tetapkan `git archive` sebagai satu-satunya jalur distribusi supaya `dist/` tidak pernah ikut.

Catatan: riset ini **tidak mengubah satu baris kode pun**. Laporan ini satu-satunya berkas yang ditulis
(`docs/riset/hardcoded-paths.md`).
