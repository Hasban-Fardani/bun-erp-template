import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { berkasSumber, bersihkanKode } from "./log-coverage-validator.ts";
import { jalankanValidator } from "./validator-cli.ts";

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

export type AturanSlop =
  | "OBVIOUS_COMMENT"
  | "STALE_COMMENT"
  | "UNUSED_EXPORT"
  | "DUPLICATE_BLOCK"
  | "PASSTHROUGH_FUNCTION"
  | "FIXME_LEFT"
  | "UNPARSED_REGION";

export interface TemuanSlop {
  rule: AturanSlop;
  file: string;
  line: number;
  detail: string;
}

/** Penanda opt-out: `slop-ok: <alasan>`. Harus ada alasan, bukan sekadar penanda. */
const PENANDA_OK = /slop-ok:\s*\S+/;

/** Kata yang tidak membawa makna untuk perbandingan komentar vs kode. */
const KATA_UMUM = new Set([
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
const VERBA_UMUM = new Set([
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

function potongKata(teks: string): string[] {
  return teks
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 3 && !KATA_UMUM.has(w));
}

/** Pisahkan camelCase / snake_case jadi kata dasar, supaya bisa dibandingkan. */
function potongIdentifiers(teks: string): string[] {
  return teks
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !KATA_UMUM.has(w));
}

/** Ambil komentar `//` beserta nomor barisnya; abaikan komentar di dalam string. */
function barisKomentar(kode: string): Array<{ line: number; teks: string }> {
  const hasil: Array<{ line: number; teks: string }> = [];
  kode.split("\n").forEach((isi, idx) => {
    const bersih = isi.trim();
    if (!bersih.startsWith("//")) return;
    const teks = bersih.replace(/^\/\/+\s?/, "").trim();
    if (teks.length > 0) hasil.push({ line: idx + 1, teks });
  });
  return hasil;
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
export function komentarMengulang(kode: string): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  const baris = kode.split("\n");
  const komentar = barisKomentar(kode);

  for (const k of komentar) {
    // Label "METODE /path -> keterangan" bukan ulangan kode.
    if (/\b(GET|POST|PUT|PATCH|DELETE)\s+\/\S*/.test(k.teks)) continue;
    if (/^[-=\s*_#/]+$/.test(k.teks)) continue;

    // Baris kode berikutnya yang bukan komentar dan bukan kosong.
    let target = "";
    for (let i = k.line; i < baris.length && i < k.line + 4; i++) {
      const isi = (baris[i] ?? "").trim();
      if (isi && !isi.startsWith("//")) {
        target = isi;
        break;
      }
    }
    if (!target) continue;
    // Baris tunggal seperti `}` atau `);` tidak punya makna untuk dibandingkan.
    if (target.replace(/[^a-z0-9]/gi, "").length < 8) continue;

    // Kata kerja generik ("hitung", "ambil") dibuang: yang tersisa harus kata
    // benda yang benar-benar muncul di kode.
    const kataKomentar = potongKata(k.teks).filter((w) => !VERBA_UMUM.has(w));
    if (kataKomentar.length < 2) continue;

    const kataKode = new Set(potongIdentifiers(target));
    const semuaAda = kataKomentar.every((w) => kataKode.has(w));
    if (semuaAda) {
      temuan.push({
        rule: "OBVIOUS_COMMENT",
        file: "",
        line: k.line,
        detail: `Komentar hanya mengulang kode di bawahnya, tanpa menambah keterangan: "${k.teks}"`,
      });
    }
  }
  return temuan;
}

/**
 * Komentar yang menyebut nama yang sudah tidak ada di berkas.
 *
 * Hanya menuduh identifier yang ditulis eksplisit dengan backtick dan berbentuk
 * camelCase, karena itulah yang benar-benar dimaksudkan sebagai rujukan kode.
 * Kata biasa di dalam backtick (`data`, `hasil`) tidak dianggap rujukan.
 */
export function komentarBasi(kode: string): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  // Komentar dibuang lebih dulu: kalau tidak, nama di dalam komentar itu sendiri
  // dianggap "masih ada di berkas" dan tuduhan tidak pernah muncul.
  const kodeBersih = bersihkanKode(kode);

  for (const k of barisKomentar(kode)) {
    const rujukan = [...k.teks.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)].map((m) => m[1] ?? "").filter(Boolean);
    for (const nama of rujukan) {
      // Rujukan nyata: menyambung kata (camelCase) atau dipanggil seperti fungsi.
      if (!/[a-z][A-Z]/.test(nama)) continue;
      if (kodeBersih.includes(nama)) continue;
      temuan.push({
        rule: "STALE_COMMENT",
        file: "",
        line: k.line,
        detail: `Komentar menyebut \`${nama}\` yang tidak ada lagi di berkas ini.`,
      });
    }
  }
  return temuan;
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
export function fungsiTanpaIsi(kode: string): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  const kodeBersih = bersihkanKode(kode);
  // Dua bentuk: `function nama(...)` dan `const nama = (...) =>`.
  const pola =
    /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*(?::[^{]*)?\{/g;
  let m: RegExpExecArray | null;

  while ((m = pola.exec(kodeBersih)) !== null) {
    const nama = m[1] || m[2] || "";
    // Fungsi yang hanya meneruskan memang BERGUNA kalau namanya menerangkan
    // sesuatu yang tidak terlihat dari isinya (penamaan ulang, pembatas modul,
    // titik sambung impor). Hanya pembungkus yang tidak menambah keterangan
    // sama sekali yang dianggap slop.
    if (
      /^(to|from|as|parse|serial|map|format|normalis|normaliz|transform|konversi|ubah|petakan|bentuk|use|create|bikin|buat)/i.test(
        nama,
      )
    ) {
      continue;
    }

    const awal = m.index + m[0].length - 1;
    let depth = 0;
    let akhir = -1;
    for (let i = awal; i < kodeBersih.length; i++) {
      if (kodeBersih[i] === "{") depth++;
      else if (kodeBersih[i] === "}") {
        depth--;
        if (depth === 0) {
          akhir = i;
          break;
        }
      }
    }
    if (akhir === -1) continue;

    const badan = kodeBersih
      .slice(awal + 1, akhir)
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean)
      .join(" ");

    // Satu pernyataan, dan pernyataan itu memanggil fungsi lain.
    if (!/^return\s+[\w$.]+\s*\([^)]*\)\s*;?$/.test(badan)) continue;

    const baris = kodeBersih.slice(0, m.index).split("\n").length;
    if (
      PENANDA_OK.test(
        kode
          .split("\n")
          .slice(Math.max(0, baris - 3), baris + 1)
          .join(" "),
      )
    )
      continue;
    temuan.push({
      rule: "PASSTHROUGH_FUNCTION",
      file: "",
      line: baris,
      detail: `Fungsi \`${nama}\` hanya meneruskan panggilan tanpa menambah apa pun.`,
    });
  }
  return temuan;
}

/**
 * Sisa pekerjaan yang ditinggal di kode; penanda tugas palsu.
 *
 * Hanya baris KOMENTAR yang diperiksa. Alat yang mencari penanda ini (validator
 * ini sendiri) memuat katanya di dalam string regex; kalau ikut diperiksa, alat
 * menuduh dirinya sendiri dan pemeriksaan jadi tidak bisa dipercaya.
 */
export function penandaTertinggal(kode: string): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  const baris = kode.split("\n");
  baris.forEach((isi, idx) => {
    const t = isi.trim();
    if (!t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")) return;
    if (!/\b(TODO|FIXME|XXX|HACK)\b/.test(isi)) return;
    if (PENANDA_OK.test(isi)) return;
    temuan.push({
      rule: "FIXME_LEFT",
      file: "",
      line: idx + 1,
      detail: `Penanda pekerjaan tertinggal di kode: ${isi.trim().slice(0, 80)}`,
    });
  });
  return temuan;
}

/** Periksa satu berkas; nama berkas diisi ke setiap temuan. */
export function periksaBerkasBerkas(jalur: string, kode: string): TemuanSlop[] {
  return [...komentarMengulang(kode), ...komentarBasi(kode), ...fungsiTanpaIsi(kode), ...penandaTertinggal(kode)].map(
    (t) => ({ ...t, file: jalur }),
  );
}

export interface OpsiPemeriksaan {
  /** File yang tidak diperiksa (mis. kode pihak ketiga). */
  lewati?: RegExp;
  /**
   * Folder tambahan yang hanya dibaca untuk mencari PEMAKAI ekspor (tests/,
   * scripts/). Isinya tidak diperiksa sebagai sumber temuan.
   */
  pemakai?: string[];
}

/** Jalankan seluruh pemeriksaan pada satu direktori. */
export function periksaSlop(dir: string, opsi: OpsiPemeriksaan = {}): TemuanSlop[] {
  const daftar = berkasSumber(dir)
    .filter((p) => !opsi.lewati?.test(p))
    .map((p) => ({ jalur: relative(dir, p), kode: readFileSync(p, "utf8") }));

  // Pemakai ekspor biasanya ada di folder uji/skrip SEBELAH `src`, bukan di
  // dalamnya. Kalau tidak dicari, ekspor yang jelas dipakai uji salah dituduh
  // mati. Dicari otomatis supaya pemanggil tidak perlu ingat.
  const dasar = dir.replace(/\/+$/, "");
  const kandidat = ["tests", "test", "scripts"].flatMap((n) => [`${dasar}/${n}`, `${dirname(dasar)}/${n}`]);
  const akarTambahan = [...(opsi.pemakai ?? []), ...kandidat.filter((d) => existsSync(d))].flatMap((d) =>
    berkasSumber(d).map((p) => readFileSync(p, "utf8")),
  );

  const perBerkas = daftar.flatMap((b) => periksaBerkasBerkas(b.jalur, b.kode));
  return [...perBerkas, ...blokGanda(daftar), ...eksporTakTerpakai(daftar, akarTambahan)].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

// Jalankan langsung: `bun adapters/slop-validator.ts <dir> [pemakai...]`
if (import.meta.main) {
  const dir = process.argv[2] ?? ".";
  jalankanValidator(
    "slop-validator.ts",
    "<dir> [folder-pemakai...]",
    () => periksaSlop(dir, { pemakai: process.argv.slice(3) }),
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
export function blokGanda(berkas: Array<{ jalur: string; kode: string }>, panjangJendela = 6): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  const peta = new Map<string, Array<{ jalur: string; line: number; tanda: boolean }>>();

  for (const { jalur, kode } of berkas) {
    // Dua versi sejajar: baris bersih untuk perbandingan, baris asli untuk
    // membaca penanda `slop-ok` (komentar dibuang di versi bersih, jadi penanda
    // hanya terlihat di versi asli).
    const barisAsli = kode.split("\n");
    const baris = bersihkanKode(kode)
      .split("\n")
      .map((b) => b.trim().replace(/\s+/g, " "))
      .map((b) => (b.replace(/[^a-z0-9]/gi, "").length < 4 ? "" : b));

    for (let i = 0; i + panjangJendela <= baris.length; i++) {
      const jendela = baris.slice(i, i + panjangJendela);
      // Jendela harus benar-benar berisi kode, bukan beberapa baris kosong.
      if (jendela.filter(Boolean).length < panjangJendela - 1) continue;
      // Sekurang-kurangnya dua baris harus berupa pernyataan (ada `=` atau
      // pemanggilan). Tanpa ini, blok yang bentuknya sama tapi isinya data
      // (literal seed, daftar field DTO, potongan JSX) ikut dituduh salinan.
      const pernyataan = jendela.filter((b) => b.includes("=") || /[a-zA-Z_$][\w$]*\s*\(/.test(b)).length;
      if (pernyataan < 2) continue;
      // Salinan yang memang disengaja ditandai di sekitar blok.
      // Manusia menaruh penanda di mana saja dekat blok (di atas komentar
      // pengantar, di baris elemen, di dalam JSX). Rentangnya dilebarkan supaya
      // penanda yang jelas-jelas menunjuk blok ini tetap terbaca.
      const sekitar = barisAsli.slice(Math.max(0, i - 4), i + panjangJendela + 4).join(" ");
      const tanda = PENANDA_OK.test(sekitar);
      const kunci = jendela.join("\n");
      if (kunci.replace(/[^a-z0-9]/gi, "").length < 60) continue;
      const daftar = peta.get(kunci) ?? [];
      daftar.push({ jalur, line: i + 1, tanda });
      peta.set(kunci, daftar);
    }
  }

  // Satu salinan panjang menghasilkan puluhan jendela yang saling bertumpuk.
  // Itu bukan puluhan masalah, tapi satu. Kumpulkan per pasangan berkas, lalu
  // gabungkan jendela yang bersambung jadi satu rentang.
  const perPasangan = new Map<string, Array<{ line: number; asalLine: number }>>();

  for (const [, daftar] of peta) {
    if (daftar.length < 2) continue;
    const [pertama, ...salinan] = daftar;
    if (!pertama) continue;
    const asal = pertama;
    // Penanda di SALAH SATU sisi sudah cukup: tujuannya menyatakan pasangan ini
    // memang disengaja, bukan mengukur di sisi mana penandanya ditulis.
    if (asal.tanda) continue;
    for (const s of salinan) {
      if (s.tanda) continue;
      if (s.jalur === asal.jalur && Math.abs(s.line - asal.line) < panjangJendela) continue;
      const kunci = `${s.jalur}|${asal.jalur}|${asal.line}`;
      const isi = perPasangan.get(kunci) ?? [];
      isi.push({ line: s.line, asalLine: asal.line });
      perPasangan.set(kunci, isi);
    }
  }

  // Gabungkan pasangan yang menunjuk asal berdekatan di berkas yang sama.
  const perBerkas = new Map<string, Array<{ line: number; asalLine: number }>>();
  for (const [kunci, isi] of perPasangan) {
    const [jalur, asalJalur] = kunci.split("|");
    const kunciBerkas = `${jalur}|${asalJalur}`;
    const gabung = perBerkas.get(kunciBerkas) ?? [];
    gabung.push(...isi);
    perBerkas.set(kunciBerkas, gabung);
  }

  for (const [kunci, isi] of perBerkas) {
    const [jalur, asalJalur] = kunci.split("|");
    isi.sort((a, b) => a.line - b.line || a.asalLine - b.asalLine);

    const asalRentang = new Map<number, { awal: number; akhir: number }>();
    for (const s of isi) {
      const r = asalRentang.get(s.asalLine);
      if (!r) {
        asalRentang.set(s.asalLine, { awal: s.line, akhir: s.line });
      } else {
        r.akhir = s.line;
      }
    }

    // Salinan bersambung digabung jadi satu rentang; asal diambil yang terkecil.
    let awal = -1;
    let akhir = -1;
    let asalLine = -1;
    for (const [asal, r] of [...asalRentang].sort((a, b) => a[1].awal - b[1].awal)) {
      if (awal === -1) {
        awal = r.awal;
        akhir = r.akhir;
        asalLine = asal;
        continue;
      }
      if (r.awal - akhir <= panjangJendela) {
        akhir = Math.max(akhir, r.akhir);
        continue;
      }
      temuan.push({
        rule: "DUPLICATE_BLOCK",
        file: jalur,
        line: awal,
        detail: `baris ${awal}-${akhir + panjangJendela - 1} identik dengan ${asalJalur}:${asalLine}. Kalau bukan kebetulan, angkat jadi satu fungsi.`,
      });
      awal = r.awal;
      akhir = r.akhir;
      asalLine = asal;
    }
    if (awal !== -1) {
      temuan.push({
        rule: "DUPLICATE_BLOCK",
        file: jalur,
        line: awal,
        detail: `baris ${awal}-${akhir + panjangJendela - 1} identik dengan ${asalJalur}:${asalLine}. Kalau bukan kebetulan, angkat jadi satu fungsi.`,
      });
    }
  }
  return temuan;
}

/**
 * Ekspor yang tidak pernah diimpor di mana pun.
 *
 * Wajib dibaca manusia sebelum dihapus: impor dinamis (lewat string, plugin,
 * entry point bundler) tidak terlihat oleh pemeriksa teks.
 */
export function eksporTakTerpakai(
  berkas: Array<{ jalur: string; kode: string }>,
  akarTambahan: string[] = [],
): TemuanSlop[] {
  const temuan: TemuanSlop[] = [];
  // Pemakai bisa berada di luar folder yang diperiksa (tests, scripts). Tanpa
  // teks itu, ekspor yang jelas dipakai uji akan salah dituduh mati.
  const semuaKode = [...berkas.map((b) => b.kode), ...akarTambahan].join("\n");

  for (const { jalur, kode } of berkas) {
    // Entry point dan berkas rute tidak dianggap ekspor mati.
    if (/(^|\/)(index|main|server|app|sw|worker)\.(ts|tsx|js|mjs)$/.test(jalur)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(jalur)) continue;

    const nama = new Set<string>();
    for (const m of kode.matchAll(
      /export\s+(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      nama.add(m[1]);
    }

    const barisKode = kode.split("\n");
    const adaPenanda = (n: string) => {
      const i = barisKode.findIndex((b) => new RegExp(`\\b${n}\\b`).test(b));
      // Penanda boleh di baris deklarasi atau satu baris di atasnya.
      const konteks = barisKode.slice(Math.max(0, i - 1), i + 1).join(" ");
      return PENANDA_OK.test(konteks);
    };

    for (const n of nama) {
      if (adaPenanda(n)) continue;
      // Hitung pemakaian di luar deklarasi. Deklarasinya sendiri juga memuat
      // namanya (di beberapa tempat), jadi yang dihitung adalah kemunculan di
      // LUAR berkas ini. Cara ini tidak salah menuduh ekspor yang dipakai
      // berkas lain, dan tidak melewatkan ekspor yang tidak dipakai siapa pun.
      const diLuar = semuaKode.replace(kode, "");
      const dipakaiLuar = new RegExp(`\\b${n}\\b`).test(diLuar);
      // Dipakai di dalam berkas ini sendiri (mis. oleh fungsi lain): masih hidup.
      const diDalam = (kode.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length;
      if (dipakaiLuar || diDalam > 1) continue;
      const baris = kode.split("\n").findIndex((b) => new RegExp(`\\b${n}\\b`).test(b)) + 1;
      temuan.push({
        rule: "UNUSED_EXPORT",
        file: jalur,
        line: baris,
        detail: `\`${n}\` diekspor tapi tidak dipakai di mana pun. Hapus, atau tambahkan \`slop-ok: <alasan>\`.`,
      });
    }
  }
  return temuan;
}
