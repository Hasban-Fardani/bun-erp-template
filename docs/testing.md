# Testing

`bun erp test` menjalankan test backend, lalu web. Backend memakai request HTTP nyata
melalui `app.request()` tanpa membuka port. Database bersama di-reset dan di-seed sebelum
kasus; migrasi diuji terpisah. Hook cold startup memakai budget integrasi 30 detik.

Default PGlite `memory://`. Jika `TEST_DATABASE_URL` diset, runner membuat database unik
per run, menjalankan suite yang sama dengan postgres.js, lalu menghapus database itu dalam
finally. Akun harus memiliki CREATEDB; target wajib server uji, bukan produksi.

Workflow CI menjalankan matriks PG16/PG18, migrasi dua kali, ledger migrasi, suite backend
serta QA browser atas API + preview web hasil build. Run pertama GitHub belum diverifikasi.

Parity compiled/uncompiled menjaga `z.compile()` dan schema sumber tetap sepadan.
Test web unit memeriksa navigasi, bukan bukti visual. `bun run qa` menjalankan browser asli,
memeriksa respons API, error JavaScript, pencarian, sorting, combobox dan mobile overflow.
Output mesin berada di `.data/qa/qa-report.json`; failure screenshot dan log disimpan terpisah.
