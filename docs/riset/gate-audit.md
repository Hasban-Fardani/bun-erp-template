# Audit: 15 keluhan pemilik — gate, test, atau cuma teks?

Tanggal: 2026-09-23. Lingkup: `/root/bun-erp-template` (Bun + Hono + Drizzle + React).
Metode: baca `erp.ts` (`runGate`/`guard`), `tools/*.ts`, `skills/*/SKILL.md`, `docs/*.md`,
`apps/*/tests/*.test.ts`; lalu **jalankan gate-nya** dan **uji RED** (rusak → jalankan → pulihkan →
verifikasi `git status --short`).

Ringkas: **6 dari 15** punya penjaga yang TERBUKTI menangkap. **5 hanya teks** di docs/skills.
**4 ada penjaga tapi bolong** — LOLOS saat diuji RED.

## Catatan metode (penting untuk membaca tabel)

- Gate yang dipanggil `bun erp check` **hanya** `skills, task, scope, slop, platform, react,
  copy, design` (erp.ts:91–98). `readiness` hanya lewat `bun erp check:prod` (erp.ts:139).
- Perintah `bun erp check:copy`, `check:design`, `check:platform`, `check:slop` **tidak ada**:
  ```
  $ bun erp check:copy
  Unknown command: check:copy. Run: bun erp --help
  ```
  `bun erp --help` hanya punya `check, test, doctor, dev, build, check:prod, env:list, route:list,
  user:*, db:*, key:generate, check:migrations, check:scope, check:react, check:task,
  skills:validate`. Jadi gate copy/design/platform/slop hanya bisa dijalankan **lewat** `bun erp check`.
- Untuk menguji gate individual saat `bun erp check` sendiri merah, gate dipanggil langsung:
  `bun -e 'import {checkX} from "./tools/x.ts"; const f=await checkX(process.cwd()); ...'`.

## Tabel audit

| # | Keluhan | Ada penjaga? | Nama penjaga (file/gate/test) | TERBUKTI menangkap? | BOLONG? |
|---|---|---|---|---|---|
| 1 | Tidak boleh ada route not-found (nav → route tak ada) | TEST | `apps/web/tests/nav-routes.test.ts` (2 test) | **YA (diuji)** — sisip nav item `url: "/tidak-ada-route-ini"` → `(fail) setiap item navigasi menunjuk path yang benar-benar terdaftar`. Pulih → lulus. | **YA — LOLOS** kalau `registeredPaths` ikut diedit. Test membandingkan nav terhadap `registeredPaths` yang **diketik manual** di `routes/route-tree.tsx:54`, bukan diturunkan dari `routeTree`. RED: tambah nav `/hantu` **dan** `"/hantu"` ke `registeredPaths`, tanpa `createRoute` → test **2 pass**. |
| 2a | CRUD nyata, bukan view-only | TEST (parsial) | `apps/server/tests/{users-crud,roles-crud,departments,identity}.test.ts` (create/update/delete nyata, cek 409/404) | **YA** — CRUD user/role/departemen diuji lewat HTTP nyata | Tidak ada gate yang memastikan **setiap** modul punya CRUD; hanya modul yang sudah ada testnya |
| 2b | Semua aksi harus button ber-ikon, bukan teks polos | **TIDAK ADA** | — | — | Tidak ada gate, test, **maupun teks aturan** (grep `ikon`, `icon-only`, `teks polos` di docs/skills/AGENTS.md → nihil) |
| 3 | Komentar WAJIB bahasa Inggris | **TIDAK ADA (hanya teks)** | Teks: `docs/conventions.md:7`, `AGENTS.md:60` | **TIDAK** — RED 1: komentar Indonesia "Fungsi ini mengambil daftar departemen…" di `departments/service.ts` → slop gate `FINDINGS: 0`. RED 2: komentar Inggris yang mengulang kode → `FINDINGS: 0`. | Bahasa **tidak diperiksa sama sekali**. `tools/slop.ts` hanya punya `NARRATIVE_RULES` berbasis frasa **Inggris** ("This file", "The only place") — komentar naratif berbahasa Indonesia lolos. Adapter `comment-slop-validator.ts` (aturan Indonesia) ada tapi **tidak dipanggil siapa pun**. |
| 4 | Migrasi bisa dibedakan sudah/belum dijalankan | GATE + TEST | `bun erp db:status` (erp.ts:295, cetak `applied`/`PENDING`, `process.exitCode = 1` jika ada pending); `check:migrations` (nama NNNN); `tools/readiness.ts:107` contiguity; `apps/server/tests/migrations.test.ts` (idempotensi + rollback + format nama) | **YA (dijalankan)** — `bun erp db:status` → `applied 0001…0005`, `5/5 applied, 0 pending`. RED contiguity: rename `0002_departments.sql` → `0009_gap.sql` → `READINESS_MIGRATIONS` fired, pulih → bersih. | Tidak. (Catatan: `db:status` bagus, tapi `check:prod` yang memuatnya sedang merah — lihat #14) |
| 5 | AGENTS.md punya garis besar + preview dokumen/skill | **TIDAK ADA (hanya teks)** | Teks saja: isi `AGENTS.md` sendiri | **TIDAK** — `grep -rn 'AGENTS' tools/ erp.ts apps/*/tests/*.ts` → nol. Tidak ada gate/test yang memeriksa isi AGENTS.md. | Teks. Bisa dikosongkan/di-rot tanpa satu gate pun berbunyi. |
| 6 | Bun-first: dilarang impor `node:` (kecuali `path`) | GATE | `tools/platform.ts` (allowlist per-file), `runGate("platform")` (erp.ts:95) | **YA (diuji)** — `import { readFileSync } from "node:fs"` di `apps/server/platform/probe-red.ts` → `NODE_BUILTIN …:1`. `node:crypto` → juga fired. Pulih → bersih. | **YA** — `platform.ts:45` `if (file.startsWith("apps/web/")) continue;` → `node:fs` di `apps/web/src/probe-node-red.ts` → `PLATFORM FINDINGS: 0`. Skrip frontend bebas impor Node. Juga tidak ada perintah `check:platform` berdiri sendiri. |
| 7 | API harus punya kontrak/standar baku tertulis | GATE + TEST | `docs/api-contract.md`; `tools/readiness.ts:123` `READINESS_API_CONTRACT`; `apps/server/tests/openapi-coverage.test.ts` (6 test) | **YA (diuji)** — hapus token `requestId` dari `docs/api-contract.md` → `READINESS_API_CONTRACT … does not mention: requestId`. Tambah route `.get("/probe-undocumented")` ke Hono → openapi-coverage `(fail)`, sisanya 5 pass. Pulih → bersih. | Tidak signifikan. (Gate kontrak hanya cek keberadaan token, bukan isi penuh; coverage test-nya kuat.) |
| 8 | Loading & empty state punya kriteria non-slop | **TIDAK ADA** | Teks: `docs/ui-states.md` (spesifikasi panjang) | **TIDAK, diakui sendiri** — `docs/ui-states.md:70`: *"`bun erp check` does not enforce these rules mechanically. They are enforced in review"*. | **Ini contoh paling telanjang**: dokumennya sendiri menyatakan tidak ada gate. Komponen `table-states.tsx` ada, tapi tidak ada aturan yang memaksa dipakai. |
| 9 | Tidak boleh ada teks teknis di layar pengguna | GATE | `tools/copy-guard.ts`, `runGate("copy")` (erp.ts:97). Teks: `docs/ui-copy.md` | **YA (diuji)** — file probe `<p>API aktif — Memuat sesi… izin user.read. Jalankan bun erp db:migrate</p>` → 4 temuan (`USER_COPY_INFRA`, `_SESSION`, `_PERMISSION-ID`, `_SHELL`). `aria-label`/`placeholder` teknis → 3 temuan. Pulih → bersih (`COPY: 0`). | **YA, dua lubang:** (a) glob hanya `apps/web/src/**/*.tsx` (copy-guard.ts:44) → berkas `.ts` tak dipindai; (b) **argumen fungsi tidak diperiksa** — `toast.error("API gagal, sesi kedaluwarsa, izin user.read")` → `COPY FINDINGS: 0`. Hanya JSX text + daftar `DISPLAY_PROPS` (label/message/title/…) yang dipindai. Karena #11 mendorong pesan ke `toast.*`, justru channel itu yang bolong dari gate ini. (c) `docs/ui-copy.md:6` & `skills/template-guardrails:138` menyebut `bun erp check:copy` — **perintah itu tidak ada**. |
| 10 | Setiap layar UI wajib punya spec arah desain | GATE | `tools/design-gate.ts`, `runGate("design")` (erp.ts:98) | **YA untuk kasus "nol spec"** — hapus `apps/web/design/login-page.json` → `(none) NO_DESIGN_SPEC BLOCKER`. Pulih → `DESIGN FINDINGS: 0`. | **YA** — gate tidak memetakan spec ke layar. Saat ini **4 page** (`login, users, roles, audit`) tapi hanya **1 spec** (`login-page.json`); `check:design` **PASSES**. Yang ditegakkan hanya "sedikitnya satu spec ada dan valid", bukan "setiap layar punya spec". |
| 11 | Tidak boleh alert inline di bawah elemen — harus toast | **TIDAK ADA** | — | — | Nihil gate, test, **dan teks aturan** (grep `toast`, `inline alert` di docs/skills/AGENTS.md → nol). Bukti hidup: `apps/web/src/pages/login-page.tsx:131-138` masih `<p role="alert" className="mt-4 …">{(login.error as Error).message}</p>` — alert inline persis di bawah form. `toast.tsx` sudah ada (untracked) tapi tak ada yang menahan pemakaian alert inline. |
| 12 | Tidak boleh hardcode path yang hanya ada di server ini | **TIDAK ADA** | — | **TIDAK** — dua path mati: `tools/slop.ts:49` dan `tools/design-gate.ts:5` → `/root/programming-governance/adapters/*.ts`. Diuji dengan menyembunyikan folder itu: `tools/slop.ts` **lolos diam-diam** (`exists()` guard → `return []` → `SLOP FINDINGS: 0`, seluruh kelas temuan AST hilang tanpa peringatan); `tools/design-gate.ts` **crash**: `error: Cannot find module '/root/programming-governance/adapters/design-direction-validator.ts'`. Pulih → folder kembali. | Tidak ada gate. `READINESS_DOMAINS` (readiness.ts:59) terlalu sempit: hanya pola `Nama-owner + domain deployment`. Selain itu regex itu **menjalar ke `readiness.ts` sendiri** → `bun erp check:prod` **gagal hari ini di repo ini** (`READINESS_DOMAINS: tools/readiness.ts mentions a real deployment`). |
| 13 | Tabel harus punya pagination + sorting default | TEST (sisi API) / **TIDAK ADA** (sisi UI) | `apps/server/tests/list-contract.test.ts` (paginasi, sort asc/desc, sort tak dikenal → 422, `totalPages ≥ 1`); `use-table-state.ts` (`defaultSort` wajib di config); `ResourceTable` | **YA untuk kontrak API** — list-contract menguji slicing nyata + urutan. | **YA di sisi UI** — tidak ada gate/test bahwa setiap halaman tabel memakai `ResourceTable`/`useTableState` dengan `defaultSort`. `apps/web/tests/` hanya berisi `nav-routes.test.ts` (2 test). Page baru bisa menulis tabel sendiri tanpa pagination/sort dan tidak ada yang berbunyi. |
| 14 | Build script produksi + validasi kesiapan produksi | GATE + skrip | `package.json` → `build: bun erp build`, `check:prod: bun erp check:prod`; `tools/readiness.ts` (`READINESS_SCRIPTS`); `erp.ts:133 build`, `:139 check:prod` | **YA untuk keberadaan skrip** — hapus `build`/`check:prod` dari package.json → `READINESS_SCRIPTS … missing scripts: build, check:prod`. Pulih → identik. | **YA, dua hal:** (a) `check:prod` **tidak** ikut `bun erp check` — gate kesiapan produksi tidak pernah jalan di alur normal; (b) gate itu **merah hari ini**: `bun erp check:prod` → `READINESS_DOMAINS` self-trip (#12). |
| 15 | Jangan klaim teruji tanpa menjalankan test | GATE + teks | `tools/tasks.ts` (`validateTasks`: status `ready`/`done` wajib `approved_by` + `evidence`), `check:task`; teks `AGENTS.md:27` (tangga `IMPLEMENTATION_DONE`→`READY_FOR_USE`) | **YA (diuji)** — ubah `docs/tasks/F1.9-cli.md` `status: in_progress` → `done` → `F1.9-cli.md: status "done" requires approved_by: <human name>`, `marked done with unmet dependencies: F1.8`. Pulih → bersih. | Parsial: gate menjaga **frontmatter task**, bukan klaim prosa agent di chat/laporan. Klaim "sudah saya test" di luar `docs/tasks/` tak tertahan gate apa pun. |

## A. Aturan yang HANYA ada sebagai teks (tanpa gate/test) — teks tidak menahan siapa pun

1. **#3 Komentar bahasa Inggris** — `docs/conventions.md:7`, `AGENTS.md:60`. Diuji: komentar
   Indonesia naratif → slop gate **0 temuan**. Adapter `comment-slop-validator.ts` (pola Indonesia)
   ada di `/root/programming-governance/adapters/` tapi **tidak direferensikan** file mana pun.
2. **#5 AGENTS.md garis besar + preview** — nol referensi di `tools/`, `erp.ts`, atau test.
3. **#8 Kriteria loading/empty non-slop** — `docs/ui-states.md`, dan dokumennya **mengakui sendiri**
   di baris 70 bahwa `bun erp check` tidak menegakkannya.
4. **#11 Alert harus toast** — tidak ada teks aturan, tidak ada gate, tidak ada test. Alert inline
   masih hidup di `login-page.tsx:131`.
5. **#2b Aksi harus button ber-ikon** — tidak ada teks aturan, tidak ada gate, tidak ada test.
6. **#15 klaim prosa agent** — aturannya ada di `AGENTS.md:27`, tapi mekanismenya (`check:task`)
   hanya membaca frontmatter `docs/tasks/*.md`; klaim di luar itu tak terjaga.

## B. Gate yang ADA tapi TERBUKTI tidak menangkap pelanggaran (bukti RED)

| # | Gate | RED yang dilakukan | Hasil | Kesimpulan |
|---|---|---|---|---|
| 1 | `nav-routes.test.ts` | Tambah nav `/hantu` **dan** entri `"/hantu"` di `registeredPaths` (`route-tree.tsx:54`), **tanpa** `createRoute` — jadi tidak ada route nyata | `2 pass 0 fail` | LOLOS. Test memakai `registeredPaths` yang manual, bukan turunan `routeTree`. Nav bisa menunjuk NotFound selama array itu ikut diedit. |
| 3 | `runGate("slop")` | Sisip komentar bahasa Indonesia yang mengulang kode di `departments/service.ts` | `FINDINGS: 0` | LOLOS. Tidak ada pemeriksaan bahasa. |
| 6 | `runGate("platform")` | `import { readFileSync } from "node:fs"` di `apps/web/src/probe-node-red.ts` | `PLATFORM FINDINGS: 0` | LOLOS. `apps/web/` di-skip di `platform.ts:45`. |
| 9 | `runGate("copy")` | `toast.error("API gagal, sesi kedaluwarsa, izin user.read")` di komponen `.tsx` | `COPY FINDINGS: 0` | LOLOS. Argumen fungsi tidak dipindai; hanya JSX text + `DISPLAY_PROPS`. |
| 10 | `runGate("design")` | 4 page ada, hanya 1 spec (`login-page.json`) | `DESIGN FINDINGS: 0` | LOLOS. Gate hanya menuntut ≥1 spec ada, tidak per-layar. |
| 12 | `runGate("slop")` | Sembunyikan `/root/programming-governance/` (simulasi mesin lain) | `SLOP FINDINGS: 0` | LOLOS **diam-diam** — `exists()` guard membuat separuh gate (seluruh temuan AST) hilang tanpa peringatan. |
| 12 | `runGate("design")` | Idem | `error: Cannot find module '/root/…/design-direction-validator.ts'` | Gate **crash**, bukan lulus — di mesin tanpa folder itu, `bun erp check` mati sebelum gate lain jalan. |
| 14 | `check:prod` | Di jalankan apa adanya di repo ini | `READINESS_DOMAINS: tools/readiness.ts mentions a real deployment` | Gate **merah permanen** karena regex client-name (nama owner) cocok dengan berkasnya sendiri. Gate yang selalu gagal = gate yang diabaikan. |
| — | `bun erp check` (keseluruhan) | Dijalankan apa adanya | `biome check failed with exit 1` (`tools/copy-guard.ts:88` `lint/style/useTemplate`) **dan** `scope failed: client-name: docs/riset/hardcoded-paths.md` | Chain gate **berhenti di biome**: `run()` memanggil `process.exit` pada kegagalan, jadi `skills/task/scope/slop/platform/react/copy/design` **tidak pernah dieksekusi**. Selama ini merah, seluruh gate di belakangnya tidak berjalan — termasuk yang sudah terbukti bagus (#6, #7, #9). |

## C. Temuan lintas-potong

- **Gate tersambung tapi tidak bisa dijalankan sendiri.** `docs/ui-copy.md:6` dan
  `skills/template-guardrails/SKILL.md:138` menunjuk `bun erp check:copy`; `--help` tidak punya
  perintah itu (`Unknown command`). Yang sama untuk `check:design`, `check:platform`, `check:slop`.
  Dokumentasi menjanjikan alat yang tidak ada.
- **Adapter governance yang tidak terpakai (18 dari 20).** Hanya `design-direction-validator.ts`
  dan `slop-validator.ts` yang direferensikan. Yang menganggur termasuk
  `comment-slop-validator.ts` (aturan komentar Indonesia), `interactive-surface-validator.ts`,
  `human-review-gate.ts`, `route-governor.ts`, `log-coverage-validator.ts`,
  `trust-boundary-validator.ts`, `import-depth-validator.ts`. Aturan yang tidak dijalankan = dokumentasi.
- **Gate bergantung pada repo pribadi di luar template.** `tools/slop.ts` + `tools/design-gate.ts`
  menunjuk `/root/programming-governance/` (static ESM import + path absolut). Di mesin lain:
  design gate crash, slop gate mengecil jadi no-op.
- **Test suite backend belum hijau.** `bun test apps/server` → `68 pass, 1 fail`
  (`openapi-coverage > spesifikasi memuat path auth` — `beforeEach/afterEach hook timed out`).
  `bun test apps/web` → `2 pass, 0 fail`.
- **Repo sedang ditulis pihak lain saat audit.** `git status --short` berubah antar-perintah
  (5 → 9 modified, muncul `apps/server/tests/list-search.test.ts`, `docs/riset/hardcoded-paths.md`).
  Semua probe RED audit ini sudah dipulihkan: `grep -iE 'probe|red' git status --short` → tidak ada
  artefak probe. Perubahan yang terlihat di `git status` **bukan** dari audit ini.

## D. Skor

| Status | Jumlah | Nomor |
|---|---|---|
| Gate/test terbukti menangkap (tanpa lubang berarti) | 3 | 4, 7, 15* |
| Ada penjaga, tapi TERBUKTI bolong | 6 | 1, 6, 9, 10, 13, 14 |
| Hanya teks di docs/skills (tanpa gate/test) | 5 | 2b, 3, 5, 8, 11 |
| Test ada untuk sisi lain (CRUD API) | 1 | 2a |
| Tidak ada penjaga sama sekali (tak ada teks, tak ada gate) | 2 | 2b, 11 (+12) |

\* #15 terjaga untuk frontmatter task, tidak untuk klaim prosa.
**#12 tidak punya penjaga apa pun** — dan justru itu akar yang membuat #6/#10/#14 rapuh di mesin lain.

## E. Perintah yang dijalankan (bukti mentah)

```bash
bun erp --help                       # check:copy/design/platform/slop TIDAK ada di daftar
bun erp check                        # EXIT 1: biome error + scope client-name → gate di belakangnya tak jalan
bun erp check:scope                  # Scope OK
bun erp check:migrations             # 5 migration(s) named correctly.
bun erp skills:validate              # Skills OK.
bun erp check:task                   # Tasks valid.
bun erp check:prod                   # EXIT 1: READINESS_DOMAINS (self-trip)
bun erp db:status                    # applied 0001..0005; 5/5 applied, 0 pending
bun test apps/server                 # 68 pass, 1 fail
bun test apps/web                    # 2 pass, 0 fail
# gate individual saat check merah:
bun -e 'import {checkPlatform} from "./tools/platform.ts"; ...'   # NODE_BUILTIN fired (server) / 0 (apps/web)
bun -e 'import {checkUserCopy} from "./tools/copy-guard.ts"; ...' # 4 temuan (JSX) / 0 (toast.error)
bun -e 'import {checkDesign} from "./tools/design-gate.ts"; ...'  # NO_DESIGN_SPEC saat spec dihapus
bun -e 'import {checkReadiness} from "./tools/readiness.ts"; ...' # SCRIPTS, MIGRATIONS, API_CONTRACT fired
```
