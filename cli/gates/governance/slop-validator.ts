import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { sourceFiles, stripCode } from "./source-utils.ts";
import { runValidator } from "./validator-cli.ts";

/**
 * Validator slop kode (patch v2.12).
 *
 * Slop = kode yang menambah baris tanpa menambah pemahaman. Bahaya utamanya
 * bukan "jelek dilihat", tapi pembaca manusia berhenti percaya pada kode: bagian
 * yang benar dan bagian yang hanya ramai diperlakukan sama.
 *
 * Alat ini hanya mengukur hal yang bisa dihitung. Rasa "kode ini jelek" TIDAK
 * diukur di sini dan tidak boleh diklaim sebagai temuan.
 *
 * Batas jujur alat ini (baca sebelum percaya):
 * - Menemukan POLA, bukan membuktikan kualitas. Lolos di sini bukan berarti kode
 *   bagus; hanya berarti tidak ada pola slop yang terukur.
 * - Pemakaian ekspor yang dinamis (impor lewat string, plugin, entry point bundler)
 *   tidak terlihat. Temuan `UNUSED_EXPORT` wajib dibaca manusia sebelum dihapus.
 * - Penanda `slop-ok: <alasan>` mematikan temuan di baris itu, untuk kasus yang
 *   sengaja. Alasan kosong tidak dihormati.
 */

export type SlopRule =
  | "OBVIOUS_COMMENT"
  | "STALE_COMMENT"
  | "UNUSED_EXPORT"
  | "DUPLICATE_BLOCK"
  | "PASSTHROUGH_FUNCTION"
  | "FIXME_LEFT"
  | "UNPARSED_REGION";

export interface SlopFinding {
  rule: SlopRule;
  file: string;
  line: number;
  detail: string;
}

/** Penanda opt-out: `slop-ok: <alasan>`. Harus ada alasan, bukan sekadar penanda. */
const OK_MARKER = /slop-ok:\s*\S+/;

/** Kata yang tidak membawa makna untuk perbandingan komentar vs kode. */
const COMMON_WORDS = new Set([
  "yang",
  "dan",
  "untuk",
  "dari",
  "ke",
  "di",
  "ini",
  "itu",
  "pada",
  "dengan",
  "atau",
  "juga",
  "sudah",
  "akan",
  "bisa",
  "jika",
  "kalau",
  "agar",
  "supaya",
  "adalah",
  "tidak",
  "bukan",
  "semua",
  "setiap",
  "satu",
  "dua",
  "nya",
  "si",
  "the",
  "and",
  "for",
  "from",
  "to",
  "of",
  "this",
  "that",
  "with",
  "or",
  "is",
  "are",
  "be",
  "a",
  "an",
  "in",
  "on",
  "as",
  "it",
  "we",
  "you",
]);

/**
 * Kata kerja umum yang tidak menambah makna.
 *
 * Komentar seperti "hitung total harga" di atas `const totalHarga = ...` adalah
 * slop klasik, tapi seluruh katanya tidak ada di kode: kata kerja `hitung` yang
 * hilang. Dengan membuang kata kerja generik dari sisi komentar, yang tinggal
 * adalah kata benda ("total", "harga") dan perbandingannya jadi tepat.
 */
const COMMON_VERBS = new Set([
  "hitung",
  "ambil",
  "cek",
  "periksa",
  "buat",
  "tambah",
  "simpan",
  "kirim",
  "muat",
  "render",
  "tampilkan",
  "validasi",
  "parse",
  "format",
  "ubah",
  "konversi",
  "hapus",
  "isi",
  "proses",
  "jalankan",
  "generate",
  "inisialisasi",
  "set",
  "get",
  "load",
  "save",
  "send",
  "create",
  "update",
  "delete",
  "handle",
  "check",
  "build",
  "return",
  "cari",
  "filter",
  "renderkan",
  "catat",
  "baca",
  "tulis",
  "pasang",
  "lepas",
  "daftar",
  "aktifkan",
  "matikan",
  "setel",
]);

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 3 && !COMMON_WORDS.has(w));
}

/** Pisahkan camelCase / snake_case jadi kata dasar, supaya bisa dibandingkan. */
function splitIdentifiers(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !COMMON_WORDS.has(w));
}

/** Ambil komentar `//` beserta nomor barisnya; abaikan komentar di dalam string. */
function commentLines(source: string): Array<{ line: number; text: string }> {
  const result: Array<{ line: number; text: string }> = [];
  source.split("\n").forEach((content, idx) => {
    const clean = content.trim();
    if (!clean.startsWith("//")) return;
    const text = clean.replace(/^\/\/+\s?/, "").trim();
    if (text.length > 0) result.push({ line: idx + 1, text });
  });
  return result;
}

/**
 * Komentar yang hanya mengulang baris kode di bawahnya.
 *
 * Diukur sebagai SUBSET, bukan kemiripan sebagian: seluruh kata isi komentar
 * harus sudah ada di baris kode. Komentar yang menambah satu kata informasi
 * ("kenapa", "catatan", "perhatian") langsung lolos, sehingga tuduhan palsu
 * minim. Batas 2 kata memastikan tidak menuduh komentar satu kata pemisah.
 *
 * Kecuali: komentar dengan bentuk label. "POST /api/x -> Upload Gambar" adalah
 * penunjuk lokasi, bukan ulangan kode; isinya justru informasi yang tidak ada di
 * baris mana pun. Pola itu langsung dilewati.
 */
export function restatingComments(source: string): SlopFinding[] {
  const findings: SlopFinding[] = [];
  const lines = source.split("\n");
  const comments = commentLines(source);

  for (const k of comments) {
    // Label "METODE /path -> keterangan" bukan ulangan kode.
    if (/\b(GET|POST|PUT|PATCH|DELETE)\s+\/\S*/.test(k.text)) continue;
    if (/^[-=\s*_#/]+$/.test(k.text)) continue;

    // Baris kode berikutnya yang bukan komentar dan bukan kosong.
    let target = "";
    for (let i = k.line; i < lines.length && i < k.line + 4; i++) {
      const content = (lines[i] ?? "").trim();
      if (content && !content.startsWith("//")) {
        target = content;
        break;
      }
    }
    if (!target) continue;
    // Baris tunggal seperti `}` atau `);` tidak punya makna untuk dibandingkan.
    if (target.replace(/[^a-z0-9]/gi, "").length < 8) continue;

    // Kata kerja generik ("hitung", "ambil") dibuang: yang tersisa harus kata
    // benda yang benar-benar muncul di kode.
    const commentWords = splitWords(k.text).filter((w) => !COMMON_VERBS.has(w));
    if (commentWords.length < 2) continue;

    const codeWords = new Set(splitIdentifiers(target));
    const allPresent = commentWords.every((w) => codeWords.has(w));
    if (allPresent) {
      findings.push({
        rule: "OBVIOUS_COMMENT",
        file: "",
        line: k.line,
        detail: `Komentar hanya mengulang kode di bawahnya, tanpa menambah keterangan: "${k.text}"`,
      });
    }
  }
  return findings;
}

/**
 * Komentar yang menyebut nama yang sudah tidak ada di berkas.
 *
 * Hanya menuduh identifier yang ditulis eksplisit dengan backtick dan berbentuk
 * camelCase, karena itulah yang benar-benar dimaksudkan sebagai rujukan kode.
 * Kata biasa di dalam backtick (`data`, `hasil`) tidak dianggap rujukan.
 */
export function staleComments(source: string): SlopFinding[] {
  const findings: SlopFinding[] = [];
  // Komentar dibuang lebih dulu: kalau tidak, nama di dalam komentar itu sendiri
  // dianggap "masih ada di berkas" dan tuduhan tidak pernah muncul.
  const cleanSource = stripCode(source);

  for (const k of commentLines(source)) {
    const references = [...k.text.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)].map((m) => m[1] ?? "").filter(Boolean);
    for (const name of references) {
      // Rujukan nyata: menyambung kata (camelCase) atau dipanggil seperti fungsi.
      if (!/[a-z][A-Z]/.test(name)) continue;
      if (cleanSource.includes(name)) continue;
      findings.push({
        rule: "STALE_COMMENT",
        file: "",
        line: k.line,
        detail: `Komentar menyebut \`${name}\` yang tidak ada lagi di berkas ini.`,
      });
    }
  }
  return findings;
}

/**
 * Fungsi yang seluruh isinya hanya meneruskan ke fungsi lain.
 *
 * Ambang "kecil" dipakai supaya tidak menuduh orkestrasi asli: hanya badan
 * satu pernyataan `return` yang dianggap lapisan tanpa isi.
 *
 * Dikecualikan: nama yang menyatakan transformasi/penamaan ulang, karena di situ
 * lapisan tipis memang punya arti.
 */
export function hollowFunctions(source: string): SlopFinding[] {
  const findings: SlopFinding[] = [];
  const cleanSource = stripCode(source);
  // Dua bentuk: `function nama(...)` dan `const nama = (...) =>`.
  const pattern =
    /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*(?::[^{]*)?\{/g;
  for (const m of cleanSource.matchAll(pattern)) {
    const name = m[1] || m[2] || "";
    // Fungsi yang hanya meneruskan memang BERGUNA kalau namanya menerangkan
    // sesuatu yang tidak terlihat dari isinya (penamaan ulang, pembatas modul,
    // titik sambung impor). Hanya pembungkus yang tidak menambah keterangan
    // sama sekali yang dianggap slop.
    if (
      /^(to|from|as|parse|serial|map|format|normalis|normaliz|transform|konversi|ubah|petakan|bentuk|use|create|bikin|buat)/i.test(
        name,
      )
    ) {
      continue;
    }

    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < cleanSource.length; i++) {
      if (cleanSource[i] === "{") depth++;
      else if (cleanSource[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;

    const body = cleanSource
      .slice(start + 1, end)
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean)
      .join(" ");

    // Satu pernyataan, dan pernyataan itu memanggil fungsi lain.
    if (!/^return\s+[\w$.]+\s*\([^)]*\)\s*;?$/.test(body)) continue;

    const lines = cleanSource.slice(0, m.index).split("\n").length;
    if (
      OK_MARKER.test(
        source
          .split("\n")
          .slice(Math.max(0, lines - 3), lines + 1)
          .join(" "),
      )
    )
      continue;
    findings.push({
      rule: "PASSTHROUGH_FUNCTION",
      file: "",
      line: lines,
      detail: `Fungsi \`${name}\` hanya meneruskan panggilan tanpa menambah apa pun.`,
    });
  }
  return findings;
}

/**
 * Sisa pekerjaan yang ditinggal di kode; penanda tugas palsu.
 *
 * Hanya baris KOMENTAR yang diperiksa. Alat yang mencari penanda ini (validator
 * ini sendiri) memuat katanya di dalam string regex; kalau ikut diperiksa, alat
 * menuduh dirinya sendiri dan pemeriksaan jadi tidak bisa dipercaya.
 */
export function leftoverMarkers(source: string): SlopFinding[] {
  const findings: SlopFinding[] = [];
  const lines = source.split("\n");
  lines.forEach((content, idx) => {
    const t = content.trim();
    if (!t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")) return;
    if (!/\b(TODO|FIXME|XXX|HACK)\b/.test(content)) return;
    if (OK_MARKER.test(content)) return;
    findings.push({
      rule: "FIXME_LEFT",
      file: "",
      line: idx + 1,
      detail: `Penanda pekerjaan tertinggal di kode: ${content.trim().slice(0, 80)}`,
    });
  });
  return findings;
}

/** Periksa satu berkas; nama berkas diisi ke setiap temuan. */
export function checkFile(filePath: string, source: string): SlopFinding[] {
  return [
    ...restatingComments(source),
    ...staleComments(source),
    ...hollowFunctions(source),
    ...leftoverMarkers(source),
  ].map((t) => ({ ...t, file: filePath }));
}

export interface CheckOptions {
  /** File yang tidak diperiksa (mis. kode pihak ketiga). */
  skip?: RegExp;
  /**
   * Folder tambahan yang hanya dibaca untuk mencari PEMAKAI ekspor (tests/,
   * scripts/). Isinya tidak diperiksa sebagai sumber temuan.
   */
  consumers?: string[];
}

/** Jalankan seluruh pemeriksaan pada satu direktori. */
export function checkSlop(dir: string, options: CheckOptions = {}): SlopFinding[] {
  const occurrences = sourceFiles(dir)
    .filter((p) => !options.skip?.test(p))
    .map((p) => ({ filePath: relative(dir, p), source: readFileSync(p, "utf8") }));

  // Pemakai ekspor biasanya ada di folder uji/skrip SEBELAH `src`, bukan di
  // dalamnya. Kalau tidak dicari, ekspor yang jelas dipakai uji salah dituduh
  // mati. Dicari otomatis supaya pemanggil tidak perlu ingat.
  const base = dir.replace(/\/+$/, "");
  const candidates = ["tests", "test", "scripts"].flatMap((n) => [`${base}/${n}`, `${dirname(base)}/${n}`]);
  const extraRoots = [...(options.consumers ?? []), ...candidates.filter((d) => existsSync(d))].flatMap((d) =>
    sourceFiles(d).map((p) => readFileSync(p, "utf8")),
  );

  const perFile = occurrences.flatMap((b) => checkFile(b.filePath, b.source));
  return [...perFile, ...duplicateBlocks(occurrences), ...unusedExports(occurrences, extraRoots)].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

// Jalankan langsung: `bun adapters/slop-validator.ts <dir> [pemakai...]`
if (import.meta.main) {
  const dir = process.argv[2] ?? ".";
  runValidator(
    "slop-validator.ts",
    "<dir> [folder-pemakai...]",
    () => checkSlop(dir, { consumers: process.argv.slice(3) }),
    (d) => `BERSIH: tidak ada pola slop terukur di ${d}`,
    dir,
  );
}

/**
 * Blok identik yang muncul lebih dari sekali.
 *
 * Jendela 6 baris, sudah dinormalkan (spasi dan komentar dibuang). Baris sepele
 * (hanya kurung/tanda baca) tidak dihitung supaya blok deklarasi seragam tidak
 * dituduh sebagai salinan.
 */
export function duplicateBlocks(
  sourceFile: Array<{ filePath: string; source: string }>,
  chunkLength = 6,
): SlopFinding[] {
  const findings: SlopFinding[] = [];
  const byKey = new Map<string, Array<{ filePath: string; line: number; flag: boolean }>>();

  for (const { filePath, source } of sourceFile) {
    // Dua versi sejajar: baris bersih untuk perbandingan, baris asli untuk
    // membaca penanda `slop-ok` (komentar dibuang di versi bersih, jadi penanda
    // hanya terlihat di versi asli).
    const originalLines = source.split("\n");
    const lines = stripCode(source)
      .split("\n")
      .map((b) => b.trim().replace(/\s+/g, " "))
      .map((b) => (b.replace(/[^a-z0-9]/gi, "").length < 4 ? "" : b));

    for (let i = 0; i + chunkLength <= lines.length; i++) {
      const chunk = lines.slice(i, i + chunkLength);
      // Jendela harus benar-benar berisi kode, bukan beberapa baris kosong.
      if (chunk.filter(Boolean).length < chunkLength - 1) continue;
      // Sekurang-kurangnya dua baris harus berupa pernyataan (ada `=` atau
      // pemanggilan). Tanpa ini, blok yang bentuknya sama tapi isinya data
      // (literal seed, daftar field DTO, potongan JSX) ikut dituduh salinan.
      const statement = chunk.filter((b) => b.includes("=") || /[a-zA-Z_$][\w$]*\s*\(/.test(b)).length;
      if (statement < 2) continue;
      // Salinan yang memang disengaja ditandai di sekitar blok.
      // Manusia menaruh penanda di mana saja dekat blok (di atas komentar
      // pengantar, di baris elemen, di dalam JSX). Rentangnya dilebarkan supaya
      // penanda yang jelas-jelas menunjuk blok ini tetap terbaca.
      const surrounding = originalLines.slice(Math.max(0, i - 4), i + chunkLength + 4).join(" ");
      const flag = OK_MARKER.test(surrounding);
      const key = chunk.join("\n");
      if (key.replace(/[^a-z0-9]/gi, "").length < 60) continue;
      const occurrences = byKey.get(key) ?? [];
      occurrences.push({ filePath, line: i + 1, flag });
      byKey.set(key, occurrences);
    }
  }

  // Satu salinan panjang menghasilkan puluhan jendela yang saling bertumpuk.
  // Itu bukan puluhan masalah, tapi satu. Kumpulkan per pasangan berkas, lalu
  // gabungkan jendela yang bersambung jadi satu rentang.
  const perPair = new Map<string, Array<{ line: number; originLine: number }>>();

  for (const [, occurrences] of byKey) {
    if (occurrences.length < 2) continue;
    const [first, ...copies] = occurrences;
    if (!first) continue;
    const origin = first;
    // Penanda di SALAH SATU sisi sudah cukup: tujuannya menyatakan pasangan ini
    // memang disengaja, bukan mengukur di sisi mana penandanya ditulis.
    if (origin.flag) continue;
    for (const s of copies) {
      if (s.flag) continue;
      if (s.filePath === origin.filePath && Math.abs(s.line - origin.line) < chunkLength) continue;
      const key = `${s.filePath}|${origin.filePath}|${origin.line}`;
      const content = perPair.get(key) ?? [];
      content.push({ line: s.line, originLine: origin.line });
      perPair.set(key, content);
    }
  }

  // Gabungkan pasangan yang menunjuk asal berdekatan di berkas yang sama.
  const perFile = new Map<string, Array<{ line: number; originLine: number }>>();
  for (const [key, content] of perPair) {
    const [filePath = "", originPath = ""] = key.split("|");
    const fileKey = `${filePath}|${originPath}`;
    const merged = perFile.get(fileKey) ?? [];
    merged.push(...content);
    perFile.set(fileKey, merged);
  }

  for (const [key, content] of perFile) {
    const [filePath = "", originPath = ""] = key.split("|");
    content.sort((a, b) => a.line - b.line || a.originLine - b.originLine);

    const originRange = new Map<number, { start: number; end: number }>();
    for (const s of content) {
      const r = originRange.get(s.originLine);
      if (!r) {
        originRange.set(s.originLine, { start: s.line, end: s.line });
      } else {
        r.end = s.line;
      }
    }

    // Salinan bersambung digabung jadi satu rentang; asal diambil yang terkecil.
    let start = -1;
    let end = -1;
    let originLine = -1;
    for (const [origin, r] of [...originRange].sort((a, b) => a[1].start - b[1].start)) {
      if (start === -1) {
        start = r.start;
        end = r.end;
        originLine = origin;
        continue;
      }
      if (r.start - end <= chunkLength) {
        end = Math.max(end, r.end);
        continue;
      }
      findings.push({
        rule: "DUPLICATE_BLOCK",
        file: filePath,
        line: start,
        detail: `baris ${start}-${end + chunkLength - 1} identik dengan ${originPath}:${originLine}. Kalau bukan kebetulan, angkat jadi satu fungsi.`,
      });
      start = r.start;
      end = r.end;
      originLine = origin;
    }
    if (start !== -1) {
      findings.push({
        rule: "DUPLICATE_BLOCK",
        file: filePath,
        line: start,
        detail: `baris ${start}-${end + chunkLength - 1} identik dengan ${originPath}:${originLine}. Kalau bukan kebetulan, angkat jadi satu fungsi.`,
      });
    }
  }
  return findings;
}

/**
 * Ekspor yang tidak pernah diimpor di mana pun.
 *
 * Wajib dibaca manusia sebelum dihapus: impor dinamis (lewat string, plugin,
 * entry point bundler) tidak terlihat oleh pemeriksa teks.
 *
 * Deviasi dari upstream (F3.3 Phase B): dulu setiap ekspor memanggil
 * `semuaKode.replace(kode, "")` + RegExp baru (O(ekspor x korpus)). Sekarang satu
 * peta kata dihitung sekali untuk seluruh korpus; `dipakaiLuar` = jumlah kata di
 * korpus dikurangi jumlah kata di berkas pemiliknya. Hasil sama, tanpa pemindaian
 * ulang per ekspor.
 */
export function unusedExports(
  sourceFile: Array<{ filePath: string; source: string }>,
  extraRoots: string[] = [],
): SlopFinding[] {
  const findings: SlopFinding[] = [];
  const WORD_PATTERN = /[A-Za-z_$][\w$]*/g;

  // Peta ekspor->pemakai: satu hitungan kata untuk seluruh korpus, plus hitungan
  // per berkas supaya pemakaian di berkas pemilik bisa dikurangkan.
  const total = new Map<string, number>();
  const count = (source: string): Map<string, number> => {
    const perWord = new Map<string, number>();
    for (const m of source.matchAll(WORD_PATTERN)) {
      const word = m[0];
      perWord.set(word, (perWord.get(word) ?? 0) + 1);
      total.set(word, (total.get(word) ?? 0) + 1);
    }
    return perWord;
  };
  const perFile = sourceFile.map((b) => count(b.source));
  // Pemakai bisa berada di luar folder yang diperiksa (tests, scripts). Tanpa
  // teks itu, ekspor yang jelas dipakai uji akan salah dituduh mati.
  for (const source of extraRoots) count(source);

  for (const [index, { filePath, source }] of sourceFile.entries()) {
    // Entry point dan berkas rute tidak dianggap ekspor mati.
    if (/(^|\/)(index|main|server|app|sw|worker)\.(ts|tsx|js|mjs)$/.test(filePath)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(filePath)) continue;

    const name = new Set<string>();
    for (const m of source.matchAll(
      /export\s+(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      if (m[1]) name.add(m[1]);
    }

    const codeLines = source.split("\n");
    const hasMarker = (n: string) => {
      const i = codeLines.findIndex((b) => new RegExp(`\\b${n}\\b`).test(b));
      // Penanda boleh di baris deklarasi atau satu baris di atasnya.
      const context = codeLines.slice(Math.max(0, i - 1), i + 1).join(" ");
      return OK_MARKER.test(context);
    };

    const fileCounts = perFile[index] ?? new Map<string, number>();
    for (const n of name) {
      if (hasMarker(n)) continue;
      // Pemakaian dihitung di LUAR berkas pemilik: korpus total dikurangi kata di
      // berkas ini. Cara ini tidak salah menuduh ekspor yang dipakai berkas lain,
      // dan tidak melewatkan ekspor yang tidak dipakai siapa pun.
      const usedOutside = (total.get(n) ?? 0) - (fileCounts.get(n) ?? 0) > 0;
      // Dipakai di dalam berkas ini sendiri (mis. oleh fungsi lain): masih hidup.
      const inside = fileCounts.get(n) ?? 0;
      if (usedOutside || inside > 1) continue;
      const lines = source.split("\n").findIndex((b) => new RegExp(`\\b${n}\\b`).test(b)) + 1;
      findings.push({
        rule: "UNUSED_EXPORT",
        file: filePath,
        line: lines,
        detail: `\`${n}\` diekspor tapi tidak dipakai di mana pun. Hapus, atau tambahkan \`slop-ok: <alasan>\`.`,
      });
    }
  }
  return findings;
}
