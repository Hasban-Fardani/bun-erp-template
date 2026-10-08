import { existsSync } from "node:fs";

/**
 * Kerangka CLI untuk seluruh validator tata kelola.
 *
 * Setiap adapter punya bentuk yang sama: ambil folder, jalankan pemeriksaan,
 * cetak temuan atau "BERSIH", keluar 0/1/2. Bentuk itu dulu disalin di tiap
 * adapter dan gampang menyimpang; kini satu tempat, jadi keluaran semua
 * validator seragam dan bisa dipakai berantai di skrip.
 */

export interface GenericFinding {
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
export function runValidator(
  fileName: string,
  usage: string,
  check: () => GenericFinding[],
  cleanSummary: (dir: string) => string,
  dir: string,
): never {
  if (!dir) {
    console.error(`Pakai: bun adapters/${fileName} ${usage}`);
    process.exit(2);
  }
  // Folder yang salah ketik bukan kegagalan pemeriksaan. Tanpa ini alat
  // menyemburkan stack trace ke pemakainya, dan pesan yang berguna tenggelam.
  if (!existsSync(dir)) {
    console.error(`Folder tidak ada: ${dir}`);
    process.exit(2);
  }

  const findings = check();
  if (findings.length === 0) {
    console.log(cleanSummary(dir));
    process.exit(0);
  }

  const perRule = new Map<string, number>();
  for (const t of findings) perRule.set(t.rule, (perRule.get(t.rule) ?? 0) + 1);

  for (const t of findings) console.log(`${t.rule} ${t.file}:${t.line} ${t.detail}`);
  console.log("\nRingkasan:");
  for (const [r, n] of [...perRule].sort((a, b) => b[1] - a[1])) console.log(`  ${r}: ${n}`);
  console.log(`${findings.length} temuan`);

  process.exit(1);
}
