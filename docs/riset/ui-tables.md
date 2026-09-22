# Pola UI/UX Tabel: shadcnspace + shadcn/ui resmi

Riset: 23 September 2026. Metode: HTTP extract, registry JSON resmi, dan **pengukuran DOM
langsung** (Chromium headless, computed styles) pada halaman authored yang sebenarnya —

- `https://shadcnspace.com/blocks/dashboard-ui/tables` (galeri)
- `https://shadcnspace.com/preview/table-11` (block asli dirender di iframe galeri)
- `https://shadcnspace.com/preview/table-01` (viewport 1440px)
- `https://shadcnspace.com/preview/datatable-01` (viewport 1440px + 390px)
- `https://ui.shadcn.com/docs/components/table`
- `https://ui.shadcn.com/docs/components/data-table`
- `https://ui.shadcn.com/r/styles/new-york-v4/{table,card,badge,button,skeleton}.json`
- `https://tailwindcss.com/docs/font-size`, `tailwindlabs/tailwindcss` `theme.css`

Catatan metodelogi: `preview/*` adalah iframe nyata di galeri
(`<iframe src="/preview/table-11" class="w-full h-full border-0">`), jadi kelas yang terbaca
adalah kelas authored milik block, **bukan** kelas situs pemasaran. Registry
`https://shadcnspace.com/r/<nama>.json` hanya mengembalikan source untuk block gratis
(`meta.isPro: false`); block Pro menjawab `403 {"error":"License required"}` — makanya
pengukuran DOM dipakai sebagai bukti utama, bukan tebakan.

Tangkapan layar (di `/tmp`, di luar repo sesuai batasan penulisan):
`/tmp/sspace-tables.png` (galeri), `/tmp/ss-table-01.png` (block Table 01),
`/tmp/ss-datatable-01.png` (Datatable 01), `/tmp/ss-table01-mobile.png` (390px),
`/tmp/official-datatable.png` (docs resmi), `/tmp/ss-empty.png`.

---

## 1. shadcnspace — block Tables (`table-01`, "Project Management Table")

**URL:** `https://shadcnspace.com/blocks/dashboard-ui/tables` → `https://shadcnspace.com/preview/table-01`
**observed_artifact:** 11 block (`table-01` … `table-11`) + 13 block datatable
(`datatable-01` … `datatable-13`: Exportable, Dense, Sorting, Filter, Paginated, Row Select,
Column Visibility, Editable, Sticky, Column DnD, Row DnD, Expandable, Advanced User).
Galeri menyediakan kontrol viewport (desktop/tablet/mobile), tombol `Show Code`, `Copy Prompt`,
dan pill perintah `npx shadcn@latest add table-XX`.

**measured_facts** (computed styles, 1440px, dark→light theme):

| Elemen | Kelas authored | Nilai terukur |
|---|---|---|
| Scroller | `relative w-full overflow-x-auto` | `display:block` |
| `<table>` | `w-full caption-bottom text-sm min-w-2xl` | width 864px, `border-collapse: collapse`, `caption-side: bottom` |
| `<thead>` | `[&_tr]:border-b` | tanpa background |
| `<tr>` header | `border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted hover:bg-transparent` | tinggi **44.5px**, border-bottom **1px** |
| `<th>` | `h-10 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 p-3 ps-6` | padding `12px 12px 12px 24px`, font **14px / line-height 20px**, weight **500**, `text-align:left`, `white-space:nowrap` |
| `<tbody>` | `[&_tr:last-child]:border-0 divide-y divide-border dark:divide-darkborder` | tanpa background |
| `<tr>` body | `border-b transition-colors hover:bg-muted/50 …` | tinggi **57px**, border-bottom 1px, `transition-duration: **0.15s**` |
| `<td>` | `align-middle [&:has([role=checkbox])]:pr-0 whitespace-nowrap p-3 ps-6` | padding `12px 0 12px 24px`, font 14px / lh 20px, tinggi 57px, `vertical-align:middle` |
| Checkbox | `peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors …` | **16×16px**, radius **4px** |
| Avatar | `h-9 w-9 rounded-full` | **36px**, radius bulat |
| Card | `group/card flex flex-col bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10` | padding `24px 0 0`, `gap: 24px`, radius **12px**, ring 1px `rgba(3,7,18,0.1)` |
| Border/ring | — | **`#e4e7eb`** (lab 91.5774 −0.154 −2.19) |
| Foreground | — | **`#010712`** |
| Muted surface | — | **`#f3f4f6`** |

**mechanism (mengapa nyaman):**
- **Header tidak diberi background, hanya 1px bottom border, weight 500, warna `text-foreground`** —
  header jadi pembatas, bukan blok gelap. Mata masuk ke data lebih dulu, bukan ke header.
- **Padding awal 24px (`ps-6`) lalu 12px antar kolom** — kolom pertama tidak menempel ke tepi card,
  jadi terbaca sebagai tabel di dalam card, bukan tabel yang bocor.
- **Ritme baris 57px** (baris = 12px pad atas + 20px konten + 12px pad bawah, konten 2 baris via gap).
  Ini memberi ruang untuk sel bertingkat (avatar + dua baris teks) tanpa baris jadi tinggi tak rata.
- **Hover `hover:bg-muted/50` + `transition-colors` 0.15s** — affordance "baris ini satu kesatuan"
  tanpa memindahkan layout. 0.15s adalah ambang "instan tapi terlihat".
- **`divide-y divide-border` di `<tbody>` + `[&_tr:last-child]:border-0`** — hanya garis horizontal;
  garis ganda (border bawah baris terakhir + border atas card) dihilangkan.
- **`min-w-2xl` (42rem/672px) + wrapper `overflow-x-auto`** — tabel tidak pernah dipecah jadi
  kolom sempit; kelebihan lebar jadi scroll, bukan kompresi.

**Kolom & chrome lain yang terukur:** progress bar pill tipis (~4–6px track, fill warna per baris
orange/blue/yellow/red/teal), kebab menu kanan tanpa chrome tombol, ikon proyek dalam tile
rounded dengan background pastel, avatar bertumpuk (`+3` pill).

---

## 2. shadcnspace — Datatable 01 + breakpoint mobile

**URL:** `https://shadcnspace.com/preview/datatable-01`
**measured_facts** (1440px):

| Elemen | Kelas authored | Nilai terukur |
|---|---|---|
| Scroller | `relative w-full overflow-x-auto` | — |
| `<table>` | `w-full caption-bottom text-sm min-w-full` | width 862px |
| `<th>` | `align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 text-base font-medium text-left border-b` | padding `12px 16px`, font **16px / lh 24px**, weight 500, tinggi **48.5px** |
| `<td>` | `p-2 align-middle [&:has([role=checkbox])]:pr-0 whitespace-nowrap py-3 px-4` | padding `12px 16px`, font 14px / lh 20px, tinggi baris **65px** |
| `<tbody>` | `[&_tr:last-child]:border-0 divide-y divide-border` | — |
| Card | `border rounded-md border-border overflow-hidden` | radius **6px**, border 1px `#e4e7eb`, `box-shadow: none` |
| Avatar | `h-10 w-10 rounded-full` | 40px |
| Badge | `group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border-transparent` | font **12px / lh 16px**, weight **500**, padding `2px 8px`, radius **32px**, bg `teal-400/10`, warna teks `teal-400` |
| Tombol aksi | `group/button … rounded-lg border bg-clip-padding text-sm font-medium` | tinggi 32px, radius 8px, bg `#010712`, teks `#e4e7eb` |

Warna badge terukur dihitung ke sRGB:
`teal-400` = **`#00d5be`**, `teal-400/10` di atas putih = **`#e6fbf8`**.
Kontras `#00d5be` di atas `#e6fbf8` = **1.73:1** — di bawah AA bahkan untuk teks ≥19px.
Ini **temuan negatif yang harus dihindari di repo ini**: alpha rendah membuat badge pastel tapi
teksnya hilang. Untuk repo, pakai fill lembut + teks gelap dari hue yang sama.

**Breakpoint mobile (viewport 390px, block yang sama):**
- `mobileTableVisible: true`, `tableW: 672`, scroller `clientWidth: 358`, `scrollWidth: 672`
- `anyCardLayout: 0` — **tidak ada reflow ke kartu**, tidak ada elemen `md:` yang disembunyikan
- Terukur: kolom terakhir terpotong (`Ma…`), tidak ada tombol "lihat detail" sebagai pengganti
- `mechanism`: pilihan sadar "tabel tetap tabel + scroll horizontal" alih-alih mengubah bentuk.
  Aman secara semantik, tapi buruk untuk ERP aksi-berat di HP (kolom aksi bisa tidak terjangkau).

---

## 3. shadcn/ui resmi — Table + Data Table

**URL:** `https://ui.shadcn.com/r/styles/new-york-v4/table.json` (source authored) dan
`https://ui.shadcn.com/docs/components/table` + `/docs/components/data-table` (DOM terukur).

**measured_facts — source registry (kelas persis):**

```tsx
// Table wrapper — WAJIB, dan berada di dalam komponen Table, bukan di pemanggil
<div data-slot="table-container" className="relative w-full overflow-x-auto">
  <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
```

| Slot | Kelas authored |
|---|---|
| `TableHeader` | `[&_tr]:border-b` |
| `TableBody` | `[&_tr:last-child]:border-0` |
| `TableFooter` | `border-t bg-muted/50 font-medium [&>tr]:last:border-b-0` |
| `TableRow` | `border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted` |
| `TableHead` | `h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]` |
| `TableCell` | `p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]` |
| `TableCaption` | `mt-4 text-sm text-muted-foreground` |

**measured_facts — DOM `ui.shadcn.com/docs/components/table` (tema neutral):**

| Properti | Nilai |
|---|---|
| `<table>` | `w-full caption-bottom text-sm` → font **14px** |
| `<th>` | `h-10 px-2 …` → padding **`0 8px`**, tinggi **40px**, weight **500**, 14px |
| `<td>` | `p-2 …` → padding **8px**, tinggi baris **37px** |
| `<tr>` | border-bottom **1px `#e5e5e5`**, `transition-duration: 0.15s` |
| caption | 14px, `color: #737373`, `margin-top: 16px` |
| border | **`#e5e5e5`** |
| muted-foreground | **`#737373`** |
| muted | **`#f5f5f5`** |

**measured_facts — DOM `ui.shadcn.com/docs/components/data-table`:**

- Baris data: tinggi **41px**; header `h-10` = **40px**; `td` padding `8px 0 8px 8px`
- Toolbar: `<Input>` filter `h-8 … rounded-lg border border-input … text-base … md:text-sm` →
  tinggi **32px**, radius **10px**, font efektif **14px** (`md:text-sm`), padding `4px 10px`;
  lebar dibatasi `max-w-sm` (**bukan full width**)
- Tombol `Columns`: `rounded-lg border … text-sm` → tinggi **32px**
- Tombol kebab aksi: **24px**, `variant="ghost"`, `size-*` kecil
- Select bahasa: `rounded-lg border … text-sm`, tinggi **28px**
- **Hover baris terukur:** `oklab(0.969998 … / 0.5)` = `#f5f5f5` @ alpha 0.5 →
  efektif **`#fafafa`** di atas putih. Sangat halus, sengaja.
- Toolbar→tabel dan tabel→footer jarak ~16px; padding card ~24px

**mechanism:**
- **`overflow-x-auto` diletakkan di dalam komponen `Table`** — setiap pemakai otomatis dapat
  scroll mobile. Ini keputusan paling penting: tidak bisa "lupa".
- **Header = 14px weight 500 tanpa uppercase dan tanpa background**, warna `text-foreground`
  (sama dengan isi tabel, bukan muted). Kontras judul kolom tetap AA, tapi tidak "berteriak".
- **Densitas resmi sengaja ketat: baris 37–41px.** Data-heavy admin ingin melihat banyak baris
  sekaligus; kepadatan tinggi + hover halus = scan cepat.
- **`hover:bg-muted/50` + `transition-colors`, tanpa zebra striping** — zebra menambah noise
  visual permanen; hover hanya muncul saat dibutuhkan.
- **`data-[state=selected]:bg-muted`** — status terpilih punya warna sendiri, jadi seleksi
  massal tidak bergantung pada checkbox saja.
- **`[&:has([role=checkbox])]:pr-0`** — kolom checkbox tidak dapat padding kanan, sehingga
  checkbox rapat seragam dengan isi sel.
- **Data Table resmi = panduan, bukan komponen.** Situs resmi menyatakan tidak ada satu komponen
  data-table; yang disediakan adalah pola komposisi di atas TanStack Table + `Table` primitif.
- **Toolbar resmi minimal: satu filter input `max-w-sm` + satu tombol `Columns`.** Bukan deretan
  filter penuh — sisa filter masuk dropdown.

---

## 4. Tangkapan layar + bacaan visual

- **Galeri** (`/tmp/sspace-tables.png`): preview di dalam iframe nyata. Card putih radius ~12px,
  border 1px tipis, di atas kanvas abu muda. Header tabel polos tanpa fill, teks near-black
  semibold. Garis pemisah tipis `#e5e7eb`. Badge "Pro" lavender `#EDE9FE`. Baris nyaman ~64–68px,
  avatar 32px + dua baris teks (nama gelap / email muted).
- **Docs resmi** (`/tmp/official-datatable.png`): monokrom zinc. Border card `#e4e4e7`, teks utama
  `#09090b`, muted `#71717a`, fill `#f4f4f5`. **Tidak ada hue brand sama sekali** di tabel.
  Header polos, `Email` sortable dengan ikon ↑↓ inline. Footer pagination: kiri `0 of 5 row(s)
  selected.` (muted, kecil), kanan Previous/Next outline.
- **390px** (`/tmp/ss-table01-mobile.png`): tabel overflow, kolom terakhir terpotong, tidak ada
  scrollbar terlihat (mobile overlay scrollbar) — **catatan penting**: overflow tanpa indikator
  membuat pengguna tidak tahu ada kolom di sebelah kanan.

---

## 5. Skala Tailwind v4 yang dipakai komponen shadcn

Sumber: `tailwindlabs/tailwindcss` → `packages/tailwindcss/theme.css`, dan
`https://tailwindcss.com/docs/font-size`.

```css
--spacing: 0.25rem;                /* 1 unit = 4px */
--text-xs: 0.75rem;   --text-xs--line-height: calc(1 / 0.75);      /* 12px / 16px */
--text-sm: 0.875rem;  --text-sm--line-height: calc(1.25 / 0.875);  /* 14px / 20px */
--text-base: 1rem;    --text-base--line-height: calc(1.5 / 1);     /* 16px / 24px */
--font-weight-medium: 500;  --font-weight-semibold: 600;
--breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-lg: 64rem;
```

Konsekuensi langsung untuk repo ini:

- `p-2` = **8px**, `p-3` = **12px**, `px-4` = **16px**, `ps-6` = **24px**, `h-10` = **40px**,
  `size-4` = **16px**, `h-9` = **36px**, `h-8` = **32px**, `gap-6` = **24px**.
- `text-sm` (0.875rem) **selalu** membawa line-height 20px. Itu sebabnya `py-2.5` (`10px`) pada
  `text-sm` memberi baris ~40px dan `p-3` (`12px`) memberi ~44px — angka yang persis muncul di
  pengukuran block shadcnspace.
- `md:` = 768px. Di bawah itu, tabel resmi **tidak** berubah bentuk — hanya scroll.

---

## 6. Kontras terukur (WCAG, sRGB relatif)

| Pasangan | Rasio |
|---|---|
| border resmi `#e5e5e5` vs putih | **1.26** |
| border repo `#e7e5e4` vs putih | **1.26** |
| border repo `#e7e5e4` vs background repo `#fafaf9` | **1.20** |
| muted-foreground resmi `#737373` vs putih | **4.74** |
| ink-muted repo `#78716c` vs putih | **4.80** |
| ink-muted repo `#78716c` vs background repo `#fafaf9` | **4.59** |
| ink-soft repo `#57534e` vs putih | **7.63** |
| accent repo `#047857` vs putih | **5.48** |
| accent repo `#047857` vs accent-soft `#ecfdf5` | **5.21** |
| badge shadcnspace `teal-400 #00d5be` vs `#e6fbf8` | **1.73 (gagal)** |

Bacaan: border 1.26:1 adalah **standar industri** untuk garis tabel (resmi shadcn persis sama,
1.26) — garis tipis sengaja tidak berkontras; yang memberi struktur adalah ritme, bukan garisnya.
Yang **tidak boleh** ditiru adalah badge alpha-rendah gaya shadcnspace. Token repo saat ini
(`ink-muted` 4.59–4.80, `accent` 5.21) sudah aman dan lebih baik dari situs itu.

---

## 7. Baseline repo saat ini (untuk perbandingan — tidak diubah)

Sumber yang dibaca, tanpa modifikasi:
`apps/web/src/styles/globals.css`, `apps/web/src/shared/ui/data-table.tsx`,
`apps/web/src/shared/ui/primitives.tsx`, `apps/web/src/features/admin/resource-table.tsx`,
`apps/web/src/shared/lib/use-table-state.ts`.

| Aspek | Repo sekarang | Pembanding authored |
|---|---|---|
| Font tabel | `text-[13.5px]` (nilai arbitrer) | `text-sm` (14px/20px), resmi + shadcnspace |
| Header | `text-[12px] font-medium text-ink-muted` (di bawah ukuran teks normal) | 14px **weight 500** **`text-foreground`** |
| Padding sel | `px-4 py-2.5` (16px / 10px) | `p-3 ps-6` atau `p-2`, atau `py-3 px-4` |
| Tinggi baris | `10+20+10` ≈ 40px, satu baris | 37–41px (resmi), 57px (roomy shadcnspace) |
| Hover baris | **tidak ada** | `hover:bg-muted/50` + `transition-colors` |
| Garis | `border-b border-border/50`, `divide-y divide-border/60` | `border-b` penuh (`divide-y divide-border`) |
| Wrapper scroll | **tidak ada** — tabel `hidden md:block` | `relative w-full overflow-x-auto` |
| Mobile | `<ul>` kartu `md:hidden` (reflow, bukan scroll) | tetap tabel + scroll (shadcnspace); resmi juga scroll |
| Sort | ikon `size={12}` hanya di kolom aktif | ikon inline di tombol header (`variant="ghost"`) |
| Badge | `px-2 py-0.5 text-[11.5px] font-medium rounded-full` | `h-5 px-2 text-xs font-medium rounded-4xl` |
| Empty | `px-4 py-10 text-center text-[13px] text-ink-muted` (polos, tanpa ikon/aksi) | ikon + judul + deskripsi + tombol |
| Toolbar | Search `flex-1 sm:max-w-xs` + `headerExtra` `ml-auto` | input `max-w-sm` + tombol sekunder |
| Pagination | `border-t border-border px-4 py-3 text-[12.5px]` | footer `border-t` + info kiri + pager kanan |

---

## 8. Delapan belas temuan yang bisa dipakai langsung

1. Header tabel resmi berwarna `text-foreground` (bukan muted) dengan `font-medium` — judul kolom
   harus terbaca sekuat isi, hanya dibedakan bobotnya.
2. Header resmi **tanpa** `uppercase` dan **tanpa** background; garis 1px adalah satu-satunya pembatas.
3. Tinggi baris resmi 37–41px, block shadcnspace 57px. Dua mode sah: padat untuk banyak baris,
   roomy untuk sel bertingkat. 40px adalah titik aman.
4. `text-sm` selalu = 14px + line-height 20px; itu angka ajaib yang mengunci semua padding.
5. Hover wajib: `hover:bg-muted/50` memberi umpan balik baris tanpa menggeser layout.
6. `transition-colors` dengan durasi **0.15s** ada di semua referensi — bukan default Tailwind.
7. `divide-y` + `[&_tr:last-child]:border-0` mencegah garis dobel di dasar tabel.
8. `overflow-x-auto` ada di dalam komponen `Table`, bukan tanggung jawab pemanggil.
9. `min-w-*` pada tabel (672px) mencegah kolom dikompres sampai tidak terbaca.
10. `[&:has([role=checkbox])]:pr-0` menyelaraskan kolom checkbox tanpa margin manual.
11. `data-[state=selected]:bg-muted` memberi status seleksi tanpa mengandalkan checkbox.
12. Toolbar resmi minimal: satu input `max-w-sm` + satu tombol `Columns`; filter lain ke dropdown.
13. Input filter `h-8` (32px) + `rounded-lg`; select `data-[size=sm]:h-7` (28px).
14. Badge resmi/shacnspace berukuran 12px/16px, weight 500, `rounded-4xl`, `h-5`, `px-2`.
15. `TableFooter` resmi: `border-t bg-muted/50 font-medium` — footer lebih gelap dari baris.
16. Caption resmi `mt-4 text-sm text-muted-foreground` — keterangan tabel tidak masuk grid.
17. Badge alpha-rendah 1.73:1 (shadcnspace) adalah anti-pola; pakai fill lembut + teks gelap.
18. Tabel 390px overflow **tanpa indikator scroll** adalah jebakan UX nyata — perlu *affordance*.

---

## 9. Rekomendasi konkret untuk `apps/web/src/shared/ui/data-table.tsx`

Semua kelas di bawah memakai token repo yang sudah ada (`border`, `ink`, `ink-soft`,
`ink-muted`, `accent`, `accent-soft`, `danger`) — tidak ada warna hex baru, tidak ada dependensi
baru. Angka mengikuti pengukuran di atas, dibulatkan ke skala Tailwind.

1. **Naikkan font tabel ke skala nyata.**
   `w-full text-[13.5px]` → `w-full text-sm` (14px/20px).
   Alasannya: 13.5px tidak punya line-height yang terikat, sehingga tinggi baris jadi tidak
   terprediksi. `text-sm` membawa 20px bawaan.

2. **Header: warna teks naik, ukuran tetap, bobot tetap.**
   `border-b border-border text-left text-[12px] font-medium text-ink-muted`
   → `border-b border-border text-left text-xs font-medium tracking-wide text-ink-soft`
   (atau `text-sm text-ink` kalau ingin persis resmi). 12px tetap boleh, tapi warnanya jangan
   `ink-muted` (4.59:1 di atas `#fafaf9`) di ukuran kecil — `ink-soft` = 7.63:1.

3. **Padding sel: satu sumber angka, konsisten header + body.**
   `px-4 py-2.5` → `px-4 py-3` untuk kedua-duanya (`th` dan `td`). Ini memberi tinggi header
   `12+20+12 = 44px` — persis 44.5px yang terukur di shadcnspace table-01, dan tetap di dalam
   rentang resmi. Kalau lebih padat diinginkan: `px-3 py-2` (= 36px, mendekati 37px resmi).

4. **Tambah hover + transisi (yang paling berdampak, satu baris).**
   `<tr className="border-b border-border/50 last:border-0">`
   → `<tr className="border-b border-border last:border-0 transition-colors hover:bg-background">`
   Catatan token: repo tidak punya `--color-muted`, tapi `background` (`#fafaf9`) di atas
   `surface` (`#ffffff`) menghasilkan selisih yang setara dengan `muted/50` resmi (`#fafafa`).

5. **Garis: buang alpha, seragamkan.**
   `border-border/50` dan `divide-border/60` → `border-border` dan `divide-border`.
   Referensi memakai border penuh 1.26:1; alpha 50–60% menurunkannya ke ~1.1:1 sehingga garis
   nyaris hilang, terutama di layar non-retina.

6. **Tambahkan wrapper scroll pada tabel desktop.**
   `<div className="relative hidden md:block">` → biarkan, tapi bungkus `<table>`:
   `<div className="relative w-full overflow-x-auto">` di dalamnya, dan tambah `min-w-[42rem]`
   pada `<table>`. Konsekuensi: alih-alih kolom terpotong, pengguna mendapat scroll.

7. **Mobile: pertahankan kartu (lebih baik dari referensi), tapi perbaiki hierarki.**
   `divide-y divide-border/60` → `divide-y divide-border`;
   `index === 0 ? "text-[14px] font-medium"` → `"text-sm font-medium text-ink"`;
   `"flex gap-2 text-[12.5px] text-ink-soft"` → `"flex gap-2 text-xs text-ink-soft"`.
   Referensi shadcnspace **gagal** di 390px; reflow ke kartu di repo adalah keputusan yang benar
   dan harus dipertahankan.

8. **Empty state: naikkan dari satu baris teks menjadi blok berstruktur.**
   Sekarang: `<p className="px-4 py-10 text-center text-[13px] text-ink-muted">`.
   Usulan: wadah `flex flex-col items-center gap-2 px-4 py-12 text-center`, ikon `size-5
   text-ink-muted` di atas, judul `text-sm font-medium text-ink`, deskripsi `text-xs
   text-ink-muted`, dan tombol pemulihan (mis. "Hapus filter") `h-8 rounded-md border
   border-border px-3 text-[13px]`. Pola resmi empty state selalu punya jalur keluar dari
   keadaan kosong; sekarang tidak ada.

9. **Bedakan empty karena filter dari empty karena belum ada data.**
   `resource-table.tsx` sudah punya `{ filtered, message }`; pakai `empty.filtered` untuk
   memilih ikon (`SearchX` vs `Inbox`) dan menyembunyikan tombol "Tambah". Ini penting di ERP —
   "tidak ada hasil" dan "belum ada data" butuh tindakan pengguna yang berbeda.

10. **Kunci kolom aksi agar tidak pernah tersembunyi.**
    Tambah `<th className="px-4 py-3 text-right">Aksi</th>` dengan `sticky right-0 bg-surface`
    (dan `bg-surface` juga di `<td>` aksi) saat wrapper scroll aktif. Tanpa ini, pada 768–1024px
    kolom aksi bisa keluar viewport.

11. **Badge: samakan ke skala referensi.**
    `rounded-full px-2 py-0.5 text-[11.5px] font-medium`
    → `inline-flex h-5 items-center rounded-full px-2 text-xs font-medium`.
    Pertahankan kontras token repo (`text-accent` di `bg-accent-soft` = **5.21:1**) — jangan
    turun ke gaya alpha-rendah `teal-400/10` yang hanya **1.73:1**.

12. **Toolbar: batasi lebar search, jangan biarkan `flex-1` melebar tanpa batas di tablet.**
    `relative flex-1 sm:max-w-xs` sudah benar. Tambah `sm:justify-between` pada wadah dan
    pastikan tinggi input konsisten dengan tombol lain (`h-8` di `Input` dan `Button` sudah sama
    — 32px, sama dengan `Columns` resmi).

13. **Pagination footer: samakan skala dan pemisah.**
    `text-[12.5px]` → `text-xs`; `px-4 py-3` → `px-4 py-3` (tetap, jika padding sel jadi `py-3`
    maka tinggi footer sejajar dengan tinggi baris). Tambah `border-t border-border` (sudah ada).

14. **Sort: biarkan ikon hanya di kolom aktif (sudah benar), tapi tambah area klik penuh.**
    `SortButton` sekarang `inline-flex items-center gap-1` tanpa padding — target kliknya sempit
    di mode padat. Tambah `-mx-1 px-1 py-0.5` agar area klik ≥ 24px tanpa mengubah posisi visual,
    dan pastikan `hover:bg-background` memberi umpan balik sama seperti hover baris.

15. **Header sticky untuk tabel panjang.**
    Pada tabel `perPage` 50/100, tambah `sticky top-0 z-10 bg-surface` pada `<tr>` header
    (border bawah harus diganti ke `box-shadow: 0 1px 0 var(--color-border)` karena `border-b`
    pada baris sticky sering hilang saat scroll). Referensi shadcnspace menyediakan block
    "Sticky Table" terpisah — ini kebutuhan nyata di ERP.

16. **Konsistenkan ukuran ikon aksi.**
    `IconButton` sudah `size-11 sm:size-8`; `SortButton` memakai `size={12}`. Samakan ikon sort
    ke `size={14}` (setara `[&_svg:not([class*='size-'])]:size-4` resmi) agar header tidak terlihat
    lebih kecil dari isinya.

17. **Jangan tambah zebra striping.** Tidak ada satu pun referensi (resmi maupun shadcnspace)
    yang memakai garis ganjil-genap. Pemisah baris + hover sudah cukup.

18. **Jangan tambah hue dekoratif pada tabel.** Docs resmi sepenuhnya monokrom; warna hanya
    dipakai untuk status (badge). Untuk repo, batasi hue pada `accent` (aksi/positif),
    `danger` (hapus/gagal), `accent-soft` (badge). Ini juga menjaga `danger-soft #fef2f2` +
    `danger #b91c1c` (kontras terukur di sebelah) tetap bermakna.

---

## 10. Yang tidak terverifikasi

- `https://shadcnspace.com/preview/empty-state` tidak dapat diukur — route itu melayani halaman
  **404** ("Lost in Space"), bukan block empty state. Bukti empty-state dari shadcnspace yang
  dipakai di §9 hanya dari galeri (kartu preview), bukan dari DOM block-nya.
- Block shadcnspace berlabel **Pro** (`table-02` … `table-11`, `datatable-02` … `datatable-13`)
  tidak dapat dibaca source-nya: `https://shadcnspace.com/r/<nama>.json` menjawab
  `403 {"error":"License required","message":"Please provide your email and license key."}`.
  Angka pada §1 dan §2 berasal dari pengukuran computed style di DOM blok **gratis**
  (`table-01`, `datatable-01`) yang dirender penuh di `/preview/...`.
- Item §9 nomor 10 dan 15 (sticky) adalah usulan turunan dari block "Sticky Table" shadcnspace
  yang source-nya berlisensi; kelasnya di sini diturunkan dari token repo, bukan disalin.
- Tidak ada build, test, atau perubahan kode yang dijalankan. Berkas ini satu-satunya yang ditulis.
