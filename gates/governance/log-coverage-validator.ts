import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { jalankanValidator } from "./validator-cli.ts";

/**
 * Validator jejak kegagalan (patch v2.11).
 *
 * Tujuan: tidak ada kegagalan yang boleh lewat tanpa meninggalkan jejak, dan
 * tidak ada rahasia yang boleh ikut tertulis ke log.
 *
 * Batas jujur alat ini (dibaca sebelum percaya hasilnya):
 * - Hanya menganalisis blok `catch (...) { ... }`. Bentuk ekspresi seperti
 *   `c.req.json().catch(() => ({}))` sengaja dilewati karena bukan penelan galat.
 * - Pencocokan kurung kurawal tidak memahami string/template yang memuat `{`
 *   atau `}`. Berkas dengan kurung di dalam string bisa salah hitung; itu
 *   dilaporkan sebagai temuan yang wajib dibaca manusia, bukan diabaikan.
 * - Alat ini menemukan POLA, bukan membuktikan perilaku. Lolos di sini tidak
 *   menggantikan pengujian runtime.
 */

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
export function bersihkanKode(code: string): string {
  let hasil = "";
  let i = 0;
  let mode: "kode" | "baris" | "blok" | "tunggal" | "ganda" | "template" = "kode";

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (mode === "kode") {
      if (ch === "/" && next === "/") {
        mode = "baris";
        hasil += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "blok";
        hasil += "  ";
        i += 2;
        continue;
      }
      if (ch === "'") mode = "tunggal";
      else if (ch === '"') mode = "ganda";
      else if (ch === "`") mode = "template";
      hasil += ch;
      i++;
      continue;
    }

    if (mode === "baris") {
      if (ch === "\n") {
        mode = "kode";
        hasil += ch;
      } else {
        hasil += " ";
      }
      i++;
      continue;
    }

    if (mode === "blok") {
      if (ch === "*" && next === "/") {
        mode = "kode";
        hasil += "  ";
        i += 2;
        continue;
      }
      hasil += ch === "\n" ? "\n" : " ";
      i++;
      continue;
    }

    // Di dalam string: pertahankan pembuka/penutup dan baris baru saja.
    if (ch === "\\") {
      hasil += "  ";
      i += 2;
      continue;
    }
    const penutup = mode === "tunggal" ? "'" : mode === "ganda" ? '"' : "`";
    if (ch === penutup) {
      mode = "kode";
      hasil += ch;
      i++;
      continue;
    }
    hasil += ch === "\n" ? "\n" : " ";
    i++;
  }

  return hasil;
}

export interface LogFinding {
  rule:
    | "SILENT_FAILURE"
    | "LOG_TO_FILE"
    | "SECRET_IN_LOG"
    | "MISSING_CONTEXT"
    | "BARE_ERROR_RESPONSE"
    | "UNPARSED_REGION";
  file: string;
  line: number;
  detail: string;
}

export interface LogPayloadLike {
  level?: unknown;
  timestamp?: unknown;
  trace_id?: unknown;
  event?: unknown;
  error?: unknown;
}

/** Penanda bahwa blok sudah meninggalkan jejak, atau sengaja tidak perlu jejak. */
const JEJAK = [
  /Logger\s*\.\s*(error|warn)\s*\(/,
  /logger\s*\.\s*(error|warn|log)\s*\(/,
  /console\s*\.\s*(error|warn)\s*\(/,
  /logEvent\s*\(/,
  /reportError\s*\(/,
  // Helper bersama yang mencatat di dalamnya. Tanpa ini, pemakaian yang benar
  // justru dituduh menelan galat begitu blok ditulis ulang jadi satu baris.
  /catatKegagalanPermintaan\s*\(/,
  /catatKegagalan\s*\(/,
  /\bthrow\b/,
  /no-log:\s*\S+/, // alasan tertulis kenapa sengaja dibiarkan
];

/** Kunci yang isinya dilarang masuk log (OWASP Logging Cheat Sheet, "Data to exclude"). */
const KUNCI_RAHASIA = [
  "password",
  "passwd",
  "pwd",
  "pin",
  "auth",
  "authorization",
  "cookie",
  "setcookie",
  "session",
  "sessionid",
  "cvv",
  "creditcard",
  "cardnumber",
  "norek",
  "rekening",
  "connectionstring",
  "databaseurl",
];

/**
 * Kunci gabungan seperti `session_token` / `accessToken` / `api_key` harus ikut
 * tertangkap, tapi pencocokan potongan huruf berbahaya: "shipping" memuat "pin".
 * Karena itu kunci gabungan dikenali lewat AKHIRAN, bukan sembarang potongan.
 */
const AKHIRAN_RAHASIA = [
  "token",
  "tokens",
  "secret",
  "secrets",
  "password",
  "passwd",
  "apikey",
  "apikeys",
  "privatekey",
  "credentials",
  "credential",
];

function kunciRahasia(kunci: string): boolean {
  const n = normalisasi(kunci);
  if (KUNCI_RAHASIA.includes(n)) return true;
  return AKHIRAN_RAHASIA.some((a) => n !== a && n.endsWith(a));
}

function normalisasi(kunci: string): string {
  return kunci.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cari blok catch dan kembalikan isinya beserta nomor baris. */
export function blokCatch(kode: string, file: string): LogFinding[] {
  const temuan: LogFinding[] = [];
  const code = bersihkanKode(kode);
  const pola = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = pola.exec(code)) !== null) {
    const awalIsi = m.index + m[0].length - 1;
    let depth = 0;
    let i = awalIsi;
    let selesai = -1;

    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          selesai = i;
          break;
        }
      }
    }

    if (selesai === -1) {
      temuan.push({
        rule: "UNPARSED_REGION",
        file,
        line: code.slice(0, m.index).split("\n").length,
        detail: "Blok catch tidak bisa dipasangkan kurungnya, wajib dibaca manusia.",
      });
      continue;
    }

    const isi = code.slice(awalIsi + 1, selesai);
    // Penanda `no-log:` hidup di komentar; dibaca dari teks asli, bukan versi bersih.
    const isiAsli = kode.slice(awalIsi + 1, selesai);
    const baris = code.slice(0, m.index).split("\n").length;
    const adaJejak = JEJAK.some((p) => p.test(isi)) || /no-log:\s*\S+/.test(isiAsli);

    if (!adaJejak) {
      temuan.push({
        rule: "SILENT_FAILURE",
        file,
        line: baris,
        detail: "Blok catch tidak mencatat apa pun dan tidak melempar ulang. Kegagalan ini tidak bisa dipantau.",
      });
    }

    // Melempar ke luar tapi membocorkan pesan mentah ke klien juga temuan.
    if (/return\s+c\s*\.\s*json\s*\(\s*\{[^}]*\berror\s*:\s*(err|e|error)\s*\.?\s*message/s.test(isi)) {
      temuan.push({
        rule: "BARE_ERROR_RESPONSE",
        file,
        line: baris,
        detail: "Pesan galat mentah dikirim ke klien; bisa membocorkan detail internal.",
      });
    }

    pola.lastIndex = selesai;
  }

  return temuan;
}

/** Periksa muatan log: konteks wajib ada, rahasia wajib tidak ada. */
export function auditMuatanLog(payload: LogPayloadLike, file = "<muatan>"): LogFinding[] {
  const temuan: LogFinding[] = [];
  const wajib: Array<keyof LogPayloadLike> = ["level", "timestamp", "trace_id", "event"];

  for (const k of wajib) {
    if (payload[k] === undefined || payload[k] === "") {
      temuan.push({
        rule: "MISSING_CONTEXT",
        file,
        line: 0,
        detail: `Muatan log kehilangan "${String(k)}" sehingga kejadian tidak bisa ditelusuri.`,
      });
    }
  }

  const telusuri = (nilai: unknown, jejak: string) => {
    if (nilai === null || nilai === undefined) return;
    if (typeof nilai === "object") {
      for (const [k, v] of Object.entries(nilai as Record<string, unknown>)) {
        if (kunciRahasia(k)) {
          temuan.push({
            rule: "SECRET_IN_LOG",
            file,
            line: 0,
            detail: `Kunci "${jejak}${k}" dilarang masuk log.`,
          });
        }
        telusuri(v, `${jejak}${k}.`);
      }
      return;
    }
    if (typeof nilai !== "string") return;

    const t = nilai.trim();
    if (/^eyJ[A-Za-z0-9_-]{10,}\./.test(t)) {
      temuan.push({ rule: "SECRET_IN_LOG", file, line: 0, detail: `Nilai di ${jejak} tampak JWT.` });
    }
    if (/^Bearer\s+\S+/i.test(t)) {
      temuan.push({ rule: "SECRET_IN_LOG", file, line: 0, detail: `Nilai di ${jejak} memuat token Bearer.` });
    }
    if (/(sk|pk|cfut|ghp|xoxb)_[A-Za-z0-9_-]{12,}/.test(t)) {
      temuan.push({ rule: "SECRET_IN_LOG", file, line: 0, detail: `Nilai di ${jejak} tampak kunci API.` });
    }
    if (/^[^\s]{6,40}=\S{6,}$/m.test(t) && /\n/.test(t)) {
      temuan.push({
        rule: "SECRET_IN_LOG",
        file,
        line: 0,
        detail: `Nilai di ${jejak} tampak isi berkas .env.`,
      });
    }
  };

  telusuri(payload, "");
  return temuan;
}

/** Log yang ditulis ke berkas sendiri tidak terkelola (bisa tumbuh / tersaji publik). */
export function auditLogSink(code: string, file: string): LogFinding[] {
  const temuan: LogFinding[] = [];
  const pola = /(appendFile|appendFileSync|createWriteStream|writeFileSync)\s*\([^)]*\.log/gs;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(code)) !== null) {
    temuan.push({
      rule: "LOG_TO_FILE",
      file,
      line: code.slice(0, m.index).split("\n").length,
      detail: "Log ditulis ke berkas sendiri; pakai stdout agar dikelola journald.",
    });
  }
  return temuan;
}

export function berkasSumber(dir: string, keluar: string[] = []): string[] {
  for (const nama of readdirSync(dir)) {
    if (nama === "node_modules" || nama.startsWith(".")) continue;
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) berkasSumber(p, keluar);
    else if (/\.(ts|tsx|js|mjs)$/.test(nama)) keluar.push(p);
  }
  return keluar;
}

export function periksaRepositori(dir: string): LogFinding[] {
  const temuan: LogFinding[] = [];
  for (const berkas of berkasSumber(dir)) {
    const kode = readFileSync(berkas, "utf8");
    temuan.push(...blokCatch(kode, berkas), ...auditLogSink(kode, berkas));
  }
  return temuan;
}

// Jalankan langsung: `bun adapters/log-coverage-validator.ts <dir>`
if (import.meta.main) {
  const dir = process.argv[2] ?? ".";
  jalankanValidator(
    "log-coverage-validator.ts",
    "<dir>",
    () => periksaRepositori(dir),
    (d) => `BERSIH: tidak ada kegagalan tanpa jejak di ${d}`,
    dir,
  );
}
