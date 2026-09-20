# AGENTS.md

Instruksi untuk AI coding agent yang bekerja di repo ini.

## Batas keras

1. **Jangan mengarang arsitektur.** Ikuti struktur yang ada. Modul baru meniru
   `apps/server/modules/departments` tanpa menambah lapisan baru.
2. **Jangan set status task ke `ready` atau `done`.** Hanya manusia yang boleh.
   Agent berhenti di `in_progress` dan menyerahkan bukti.
3. **Jangan mengarang aturan bisnis, nama client, atau data produk.** Repo ini template.
   `bun erp check:scope` menolaknya.
4. **Jangan klaim fitur teruji tanpa menjalankan test.** Status jujur:
   IMPLEMENTATION_DONE, API_UNIT_TESTED, UI_TESTED, READY_FOR_USE.
5. **Jangan menambah dependency** bila API Bun atau Web Platform cukup.

## Sebelum menyerahkan pekerjaan

```bash
bun erp check
bun erp test
```

Sebutkan apa yang sudah dijalankan dan apa hasilnya, bukan apa yang seharusnya terjadi.

## Di mana menaruh sesuatu

- Kontrak input -> `modules/<nama>/schema.ts`
- Tabel -> `modules/<nama>/data.ts`, migrasi di `apps/server/migrations/`
- Business logic -> `modules/<nama>/service.ts`
- Authorization -> `modules/<nama>/policy.ts`
- HTTP -> `modules/<nama>/route.ts`
- Dokumen -> `docs/`
