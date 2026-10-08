import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Ganti isi komentar dan isi string dengan spasi, dengan jumlah baris tetap sama.
 *
 * Dua alasan:
 * 1. Komentar yang menyebut `catch` atau berisi `{` tidak boleh dianggap kode.
 *    Tanpa ini alat menuduh dirinya sendiri.
 * 2. Kurung di dalam string tidak boleh merusak penghitungan kurung.
 *
 * Nomor baris tetap karena setiap karakter diganti tepat satu spasi dan baris
 * baru dipertahankan.
 */
export function stripCode(code: string): string {
  let result = "";
  let i = 0;
  let mode: "kode" | "baris" | "blok" | "tunggal" | "ganda" | "template" = "kode";

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (mode === "kode") {
      if (ch === "/" && next === "/") {
        mode = "baris";
        result += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "blok";
        result += "  ";
        i += 2;
        continue;
      }
      if (ch === "'") mode = "tunggal";
      else if (ch === '"') mode = "ganda";
      else if (ch === "`") mode = "template";
      result += ch;
      i++;
      continue;
    }

    if (mode === "baris") {
      if (ch === "\n") {
        mode = "kode";
        result += ch;
      } else {
        result += " ";
      }
      i++;
      continue;
    }

    if (mode === "blok") {
      if (ch === "*" && next === "/") {
        mode = "kode";
        result += "  ";
        i += 2;
        continue;
      }
      result += ch === "\n" ? "\n" : " ";
      i++;
      continue;
    }

    // Di dalam string: pertahankan pembuka/penutup dan baris baru saja.
    if (ch === "\\") {
      result += "  ";
      i += 2;
      continue;
    }
    const closer = mode === "tunggal" ? "'" : mode === "ganda" ? '"' : "`";
    if (ch === closer) {
      mode = "kode";
      result += ch;
      i++;
      continue;
    }
    result += ch === "\n" ? "\n" : " ";
    i++;
  }

  return result;
}

export function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
