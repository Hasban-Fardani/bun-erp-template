# Development

```bash
cp .env.example .env
bun install
bun erp key:generate     # opsional di development
bun erp db:migrate
bun erp db:seed
bun erp dev
```

Tiga perintah setelah env terisi sudah cukup untuk menjalankan server (indikator
keberhasilan PRD §2). `bun erp doctor` memeriksa semuanya sekaligus.

Perintah lain:

- `bun erp env:list` — daftar config tanpa pernah mencetak nilai rahasia
- `bun erp route:list` — route dibaca dari aplikasi yang benar-benar dibentuk
- `bun erp test` — harness `bun:test`
- `bun erp check` — lint, tipe, gate skills/task/scope
