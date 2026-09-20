import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Gate slop untuk repo template. Dua keluarga temuan:
 *
 *  - komentar: narasi pembuka berkas, penjelasan yang mengulang tipe, komentar usang
 *  - kode: fungsi passthrough, export tanpa pemakai, blok duplikat
 *
 * Pola disengaja sempit: hanya yang terbukti berulang, bukan selera gaya. Komentar
 * `slop-ok: <alasan>` di dekat blok membebaskannya dari temuan.
 */
export async function findCodeSlop(root: string): Promise<string[]> {
  const findings: string[] = [];
  const sourceDirs = [join(root, "apps"), join(root, "tools")].filter((dir) => exists(dir));

  for (const dir of sourceDirs) {
    for (const file of tsFiles(dir)) {
      const rel = file.slice(root.length + 1);
      const lines = readFileSync(file, "utf-8").split("\n");

      lines.forEach((line, i) => {
        if (/slop-ok/.test(line)) return;
        for (const rule of [NARASI_BERKAS, ULANG_TIPE]) {
          if (rule.test(line)) {
            findings.push(`${rel}:${i + 1} komentar naratif — jelaskan KENAPA, bukan APA: ${line.trim().slice(0, 70)}`);
          }
        }
      });
    }
  }

  // Validator governance menangkap pola lintas-berkas (passthrough, unused export,
  // duplikat) yang butuh AST — dijalankan sebagai subproses supaya satu sumber aturan.
  const validator = "/root/programming-governance/adapters/slop-validator.ts";
  if (exists(validator)) {
    const proc = Bun.spawn(["bun", validator, join(root, "apps"), join(root, "tools")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code !== 0) {
      for (const line of out.split("\n")) {
        if (/^[A-Z_]+ /.test(line)) findings.push(line.trim());
      }
    }
  }

  return findings;
}

const NARASI_BERKAS =
  /^\s*(\/\/|\*)\s*(Satu-satunya tempat|Ini satu-satunya|Berkas ini (berisi|menyimpan|mengatur)|File ini)\b/i;
const ULANG_TIPE = /^\s*\*\s*(Entry Vite yang dimuat|Nilai .+ yang dipakai|Tipe .+ untuk)\b/i;

function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (path.includes("node_modules")) continue;
    if (statSync(path).isDirectory()) tsFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}
