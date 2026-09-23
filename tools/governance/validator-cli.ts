import { existsSync } from "node:fs";

/**
 * Kerangka CLI untuk seluruh validator tata kelola.
 *
 * Setiap adapter punya bentuk yang sama: ambil folder, jalankan pemeriksaan,
 * cetak temuan atau "BERSIH", keluar 0/1/2. Bentuk itu dulu disalin di tiap
 * adapter dan gampang menyimpang; kini satu tempat, jadi keluaran semua
 * validator seragam dan bisa dipakai berantai di skrip.
 */

export interface TemuanUmum {
  rule: string;
  file: string;
  line: number;
  detail: string;
}

/**
 * Jalankan satu validator sebagai program.
 *
 * @param namaBerkas nama adapter (untuk pesan pakai)
 * @param pakai contoh pemakaian setelah nama adapter
 * @param periksa pemeriksaannya
 * @param ringkasApakahKosong kalimat saat tidak ada temuan
 */
export function jalankanValidator(
  namaBerkas: string,
  pakai: string,
  periksa: () => TemuanUmum[],
  ringkasApakahKosong: (dir: string) => string,
  dir: string,
): never {
  if (!dir) {
    console.error(`Pakai: bun adapters/${namaBerkas} ${pakai}`);
    process.exit(2);
  }
  // Folder yang salah ketik bukan kegagalan pemeriksaan. Tanpa ini alat
  // menyemburkan stack trace ke pemakainya, dan pesan yang berguna tenggelam.
  if (!existsSync(dir)) {
    console.error(`Folder tidak ada: ${dir}`);
    process.exit(2);
  }

  const temuan = periksa();
  if (temuan.length === 0) {
    console.log(ringkasApakahKosong(dir));
    process.exit(0);
  }

  const perAturan = new Map<string, number>();
  for (const t of temuan) perAturan.set(t.rule, (perAturan.get(t.rule) ?? 0) + 1);

  for (const t of temuan) console.log(`${t.rule} ${t.file}:${t.line} ${t.detail}`);
  console.log("\nRingkasan:");
  for (const [r, n] of [...perAturan].sort((a, b) => b[1] - a[1])) console.log(`  ${r}: ${n}`);
  console.log(`${temuan.length} temuan`);

  process.exit(1);
}
