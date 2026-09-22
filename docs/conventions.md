# Konvensi

Ditegakkan `bun erp check`; bila tidak lolos, commit tidak sah.

- TypeScript strict, tanpa `any` yang tidak beralasan.
- Satu file dahulu; pecah saat ada tanggung jawab nyata.
- Komentar **berbahasa Inggris** dan menjelaskan **kenapa**, bukan mengulang kode di baris
  bawahnya. Berlaku juga untuk komentar SQL. Teks yang tampil ke pengguna tidak diatur ini —
  itu milik produk, bukan kode.
- Blok logika identik diangkat menjadi satu fungsi; ekspor mati dihapus.
- `catch` tidak boleh menelan error tanpa catatan atau `no-log: <alasan>`.
- Rahasia tidak pernah masuk log maupun output CLI.
- Nama migrasi `NNNN_snake_case.sql`, forward-only.
- Peristiwa normal berfrekuensi tinggi tidak dicatat; hanya kegagalan dan yang lambat.
