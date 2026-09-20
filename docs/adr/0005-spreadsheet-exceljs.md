# ADR-0005 — Spreadsheet: ExcelJS saja

**Status:** Diterima

## Keputusan

Paket `xlsx` di npm sudah ditinggalkan (pengembangan pindah ke distribusi CDN SheetJS)
dan versi npm-nya terpapar CVE-2023-30533 serta CVE-2024-22363 tanpa versi aman di
registry. SheetJS CE dihapus dari daftar dependency.

**Konsekuensi:** import/export XLSX memakai ExcelJS; tidak ada dependency ber-CVE terbuka.

**Alternatif ditolak:** SheetJS (`xlsx`).
