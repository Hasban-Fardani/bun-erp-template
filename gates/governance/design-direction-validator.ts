// Design Direction Gate (DDG) & Measurable Anti-Slop Validator (PRD v2.6)
// Memisahkan kelas surface marketing vs operational, dan mengubah kriteria anti-slop
// dari adjektiva menjadi ambang yang dapat GAGAL.

export type SurfaceClass = "marketing_surface" | "operational_surface";

export type DirectionStatus = "NOT_RUN" | "PROPOSED" | "APPROVED" | "INHERITED" | "IMPLEMENTED" | "DRIFTED";

/**
 * Bukti bahwa perancang benar-benar MELIHAT rujukan, bukan membaca katalognya.
 * Tanpa ini, "referensi" hanya nama galeri — bukan mekanisme visual.
 */
export interface ReferenceEvidence {
  url: string;
  /** Nama berkas tangkapan layar hasil kunjungan nyata. Wajib ada. */
  observed_artifact: string;
  /** Nilai terukur dari halaman nyata (font-size, max-width, dsb). Bukan adjektiva. */
  measured_facts: Record<string, string>;
  /** Fitur mekanis yang diekstrak dengan namanya, mis. "deliberate-occlusion-of-own-text". */
  mechanism: string;
  /** Bagaimana mekanisme ini diterapkan ke halaman yang dibangun. */
  application: string;
}

/**
 * Membuktikan mekanisme yang dipinjam benar-benar MENDARAT, bukan hanya disebut.
 * Celah nyata: mock sebelumnya mencantumkan rujukan tapi mekanismenya tidak terlihat di render.
 */
export interface ReferenceFidelity {
  url: string;
  observed_artifact: string;
  /** Mekanisme dari halaman rujukan yang benar-benar diterapkan. */
  copied: string;
  /** Bagian yang sengaja MENYIMPANG dari rujukan. Wajib dinyatakan, bukan disembunyikan. */
  deviated: string;
  /** Alasan penyimpangan. Menyalin buta = tiruan; menyimpang tanpa alasan = mengarang. */
  reason: string;
}

export interface DirectionOption {
  option_id: string;
  role: "primary" | "alternate";
  reference_refs: string[];
  patterns: string[];
  tradeoff: string;
  mock_path?: string;
  /**
   * Wajib minimal 2 untuk status PROPOSED/APPROVED.
   * Diambil dari halaman referensi LIVE, bukan dari taksonomi galeri.
   */
  reference_evidence?: ReferenceEvidence[];
  /** Mekanisme authored tunggal yang membedakan opsi ini dari template. */
  authored_device?: string;
  /** Komposisi yang dilarang karena generik. */
  forbidden_composition_hits?: string[];
  /** Wajib minimal 1 untuk PROPOSED/APPROVED. */
  reference_fidelity?: ReferenceFidelity[];
}

export interface StyleFacts {
  contrast_min_ratio: number;
  unique_font_sizes: number;
  unique_weights: number;
  accent_hues: number;
  nested_card_depth: number;
  icon_libraries: number;
  radius_styles: number;
  browser_surfaces_themed: boolean;
  reduced_motion_respected: boolean;
  section_scaffolds_repeated?: number;
  hero_cliche_stack?: boolean;
  kicker_above_heading?: boolean;
  gradient_multistop?: boolean;
  emoji_as_icon?: boolean;
  motion_unmapped?: boolean;
  /**
   * Elemen identitas visual yang dikarang agent tanpa persetujuan pemilik
   * (logo, monogram, maskot, avatar, ilustrasi wajah). Setiap nama di sini
   * adalah pelanggaran; aset yang disetujui tidak dicantumkan.
   */
  invented_identity_assets?: string[];
  /** Gambar orang (wajah/potret) yang direkayasa, bukan foto asli subjek. */
  fabricated_portrait?: boolean;
  copy_forbidden_hits?: string[];
}

export interface DesignDirectionSpec {
  feature_id: string;
  surface_class: SurfaceClass;
  status: DirectionStatus;
  options: DirectionOption[];
  approved_option_id?: string;
  approved_by?: string;
  approved_at?: string;
  mock_paths: string[];
  ui_code_requested: boolean;
  style: StyleFacts;
  notes?: string;
}

export interface DesignViolation {
  code: string;
  severity: "BLOCKER" | "HIGH" | "MEDIUM";
  message: string;
  target?: string;
}

export interface DesignDirectionResult {
  status: "PASS" | "FAIL";
  code: number;
  violations: DesignViolation[];
  metrics: {
    checked_criteria: number;
    violations_count: number;
    options_count: number;
  };
}

/** Ambang terukur. Satu tempat, bukan tersebar sebagai angka ajaib. */
export const ANTI_SLOP_THRESHOLDS = {
  contrast_body_min: 4.5,
  max_accent_hues: 3,
  max_icon_libraries: 1,
  max_nested_card_depth: 1,
  max_unique_font_sizes: 8,
  min_unique_weights: 2,
  max_radius_styles: 4,
  max_repeated_section_scaffolds: 2,
  min_reference_evidence: 2,
} as const;

/**
 * Komposisi marketing yang terbukti dihasilkan model tanpa berpikir.
 * Terverifikasi berlawanan dengan praktik situs authored nyata (2026-09).
 * Contoh pengukuran: paco.me memakai H1 16px (setara teks badan);
 * rauno.me memakai elemen authored berupa oklusi sengaja, bukan nama besar.
 */
export const GENERIC_COMPOSITION_BANS = [
  "large-display-name-hero",
  "eyebrow-kicker-above-headline",
  "two-cta-primary-secondary",
  "proof-strip-three-column-numbers",
  "muted-subtitle-under-headline",
  "gradient-text-accent",
  "em-italic-accent-in-headline",
  "three-identical-feature-cards",
] as const;

/** Pola marketing yang dilarang menjadi default pada surface operasional. */
export const MARKETING_ONLY_PATTERNS = [
  "centered-hero-two-cta",
  "hero-two-cta",
  "bento-feature-grid",
  "kicker-eyebrow",
  "entrance-animation-per-section",
  "badge-above-heading",
] as const;

const UI_ALLOWED_STATUS: ReadonlySet<DirectionStatus> = new Set<DirectionStatus>([
  "APPROVED",
  "INHERITED",
  "IMPLEMENTED",
]);

export class DesignDirectionValidator {
  static validate(spec: DesignDirectionSpec): DesignDirectionResult {
    const violations: DesignViolation[] = [];
    let checked = 0;

    const push = (code: string, severity: DesignViolation["severity"], message: string, target?: string) =>
      violations.push({ code, severity, message, target });

    // ---------- Bagian 1: DDG (gerbang approval) ----------
    const requiresProposal = spec.status === "PROPOSED" || spec.status === "APPROVED";
    const optionsChecked = requiresProposal || spec.ui_code_requested;
    // Gerbang kualitas opsi (bukti observasi, fidelitas, komposisi generik) tidak
    // boleh ikut mati saat status naik ke IMPLEMENTED. Status adalah catatan
    // kemajuan; kepatuhan opsi adalah sifat desainnya. Mematikannya saat
    // implementasi berarti mock buruk lolos begitu kodenya ditulis.
    const inspectOptions = spec.status !== "INHERITED" && spec.options.length > 0;

    if (inspectOptions) {
      checked += 7;

      if (requiresProposal && spec.options.length !== 3) {
        push(
          "OPTION_COUNT_INVALID",
          "BLOCKER",
          `Proposal wajib tepat 3 opsi (1 utama + 2 alternatif), ditemukan ${spec.options.length}.`,
          spec.feature_id,
        );
      }

      if (!spec.options.some((o) => o.role === "primary")) {
        push("NO_PRIMARY_OPTION", "BLOCKER", "Proposal wajib menandai satu opsi sebagai primary.", spec.feature_id);
      }
      for (const opt of spec.options) {
        if (!opt.reference_refs || opt.reference_refs.length === 0) {
          push(
            "OPTION_UNSOURCED",
            "HIGH",
            `Opsi ${opt.option_id} tidak merujuk entri registry referensi mana pun.`,
            opt.option_id,
          );
        }
        if (!opt.tradeoff || opt.tradeoff.trim().length === 0) {
          push("OPTION_NO_TRADEOFF", "MEDIUM", `Opsi ${opt.option_id} tidak menyatakan tradeoff.`, opt.option_id);
        }

        // --- Bukti observasi: melihat halaman nyata, bukan membaca katalog ---
        const ev = opt.reference_evidence ?? [];
        if (ev.length === 0) {
          push(
            "NO_REFERENCE_OBSERVATION",
            "BLOCKER",
            `Opsi ${opt.option_id} tidak menyertakan satu pun bukti observasi halaman referensi. ` +
              `Menyebut nama galeri bukan referensi — tangkapan layar + fakta terukur wajib ada.`,
            opt.option_id,
          );
        } else if (ev.length < ANTI_SLOP_THRESHOLDS.min_reference_evidence) {
          push(
            "INSUFFICIENT_REFERENCE_EVIDENCE",
            "HIGH",
            `Opsi ${opt.option_id} hanya punya ${ev.length} bukti observasi (minimum ${ANTI_SLOP_THRESHOLDS.min_reference_evidence}).`,
            opt.option_id,
          );
        }

        for (const e of ev) {
          if (!e.observed_artifact || e.observed_artifact.trim().length === 0) {
            push(
              "REFERENCE_NOT_OBSERVED",
              "BLOCKER",
              `Bukti ${e.url} tidak menyertakan artefak tangkapan layar. Klaim rujukan tanpa bukti lihat = fabrikasi.`,
              opt.option_id,
            );
          }
          if (!e.measured_facts || Object.keys(e.measured_facts).length === 0) {
            push(
              "REFERENCE_UNMEASURED",
              "HIGH",
              `Bukti ${e.url} tidak menyertakan fakta terukur. Adjektiva tidak bisa diverifikasi.`,
              opt.option_id,
            );
          }
          if (!e.mechanism || e.mechanism.trim().length === 0) {
            push(
              "REFERENCE_NO_MECHANISM",
              "HIGH",
              `Bukti ${e.url} tidak menamai mekanisme yang diekstrak.`,
              opt.option_id,
            );
          }
        }

        // --- Mekanisme rujukan wajib mendarat, bukan hanya disebut ---
        const fid = opt.reference_fidelity ?? [];
        if (fid.length === 0) {
          push(
            "REFERENCE_UNLANDED",
            "HIGH",
            `Opsi ${opt.option_id} menyebut rujukan tanpa menyatakan apa yang benar-benar dipinjam ` +
              `(copied), apa yang sengaja menyimpang (deviated), dan alasannya.`,
            opt.option_id,
          );
        }
        for (const f of fid) {
          if (!f.copied?.trim() || !f.deviated?.trim() || !f.reason?.trim()) {
            push(
              "REFERENCE_FIDELITY_INCOMPLETE",
              "HIGH",
              `Bukti fidelitas ${f.url} tidak lengkap: copied/deviated/reason wajib terisi semua.`,
              opt.option_id,
            );
          }
        }

        // --- Komposisi generik dilarang ---
        const hits = (opt.forbidden_composition_hits ?? []).filter((h) =>
          (GENERIC_COMPOSITION_BANS as readonly string[]).includes(h),
        );
        if (hits.length > 0) {
          push(
            "GENERIC_COMPOSITION",
            "BLOCKER",
            `Opsi ${opt.option_id} memakai komposisi generik: ${hits.join(", ")}. ` +
              `Komposisi ini dihasilkan tanpa berpikir dan terbukti berlawanan dengan situs authored nyata.`,
            opt.option_id,
          );
        }

        // --- Wajib ada satu perangkat authored ---
        if (opt.role === "primary" && (!opt.authored_device || opt.authored_device.trim().length === 0)) {
          push(
            "NO_AUTHORED_DEVICE",
            "HIGH",
            `Opsi utama ${opt.option_id} tidak menamai satu perangkat authored yang membedakannya dari template.`,
            opt.option_id,
          );
        }
      }
    }

    if (spec.status === "APPROVED" && spec.mock_paths.length === 0) {
      checked += 1;
      push(
        "NO_VISUAL_PROOF",
        "BLOCKER",
        "Status APPROVED tanpa bukti mock visual. Teks tidak membuktikan hierarki visual.",
        spec.feature_id,
      );
    }

    if (spec.ui_code_requested && !UI_ALLOWED_STATUS.has(spec.status)) {
      checked += 1;
      push(
        "PREMATURE_UI_CODE",
        "BLOCKER",
        `Penulisan kode UI diminta saat status arah desain = ${spec.status}. Wajib APPROVED lebih dulu.`,
        spec.feature_id,
      );
    }

    if (optionsChecked && spec.status !== "INHERITED") {
      checked += 1;
      const offClass = spec.options.flatMap((o) =>
        o.patterns
          .filter((p) => (MARKETING_ONLY_PATTERNS as readonly string[]).includes(p))
          .map((p) => ({ option: o.option_id, pattern: p })),
      );
      if (spec.surface_class === "operational_surface" && offClass.length > 0) {
        push(
          "SURFACE_CLASS_MISMATCH",
          "BLOCKER",
          `Pola marketing dipakai pada operational_surface: ${offClass
            .map((m) => `${m.pattern} (${m.option})`)
            .join(", ")}.`,
          spec.feature_id,
        );
      }
    }

    // ---------- Bagian 2: Anti-slop terukur ----------
    const s = spec.style;
    if (s) {
      const rules: Array<[boolean, string, DesignViolation["severity"], string]> = [
        [
          s.contrast_min_ratio < ANTI_SLOP_THRESHOLDS.contrast_body_min,
          "CONTRAST_FAIL",
          "BLOCKER",
          `Kontras minimum ${s.contrast_min_ratio}:1 di bawah ambang ${ANTI_SLOP_THRESHOLDS.contrast_body_min}:1.`,
        ],
        [
          s.unique_font_sizes > ANTI_SLOP_THRESHOLDS.max_unique_font_sizes,
          "TYPE_SCALE_ARBITRARY",
          "HIGH",
          `${s.unique_font_sizes} ukuran font unik (maksimum ${ANTI_SLOP_THRESHOLDS.max_unique_font_sizes}). Skala wajib berasio.`,
        ],
        [
          s.unique_weights < ANTI_SLOP_THRESHOLDS.min_unique_weights,
          "WEIGHT_FLAT",
          "MEDIUM",
          `Hanya ${s.unique_weights} bobot font unik. Hierarki butuh minimal ${ANTI_SLOP_THRESHOLDS.min_unique_weights}.`,
        ],
        [
          s.accent_hues > ANTI_SLOP_THRESHOLDS.max_accent_hues,
          "ACCENT_SPRAWL",
          "HIGH",
          `${s.accent_hues} hue aksen jenuh (maksimum ${ANTI_SLOP_THRESHOLDS.max_accent_hues}).`,
        ],
        [
          s.nested_card_depth > ANTI_SLOP_THRESHOLDS.max_nested_card_depth,
          "NESTED_CARDS",
          "BLOCKER",
          `Kartu bersarang ${s.nested_card_depth} level. Kartu di dalam kartu selalu salah.`,
        ],
        [
          s.icon_libraries > ANTI_SLOP_THRESHOLDS.max_icon_libraries,
          "ICON_SET_MIXED",
          "BLOCKER",
          `Ikon berasal dari ${s.icon_libraries} library berbeda. Wajib satu set dengan stroke seragam.`,
        ],
        [
          s.radius_styles > ANTI_SLOP_THRESHOLDS.max_radius_styles,
          "RADIUS_STYLE_SPRAWL",
          "MEDIUM",
          `${s.radius_styles} gaya border-radius tanpa skala terdefinisi (maksimum ${ANTI_SLOP_THRESHOLDS.max_radius_styles}).`,
        ],
        [s.emoji_as_icon === true, "EMOJI_ICON", "BLOCKER", "Emoji dipakai sebagai ikon UI."],
        [
          (s.invented_identity_assets ?? []).length > 0,
          "INVENTED_IDENTITY",
          "BLOCKER",
          `Elemen identitas visual dikarang tanpa persetujuan: ${(s.invented_identity_assets ?? []).join(", ")}. ` +
            "Logo, monogram, maskot, dan avatar adalah klaim tentang pemiliknya. Tanya dulu, baru gambar.",
        ],
        [
          s.fabricated_portrait === true,
          "FABRICATED_PORTRAIT",
          "BLOCKER",
          "Wajah orang direkayasa untuk mewakili orang nyata. Potret wajib foto asli subjek.",
        ],
        [
          s.gradient_multistop === true,
          "GRADIENT_MULTISTOP",
          "BLOCKER",
          "Gradien multi-stop dekoratif pada teks/tombol/hero.",
        ],
        [
          s.kicker_above_heading === true,
          "KICKER_BANNED",
          "BLOCKER",
          "Kicker/eyebrow/badge di atas heading. Heading wajib berdiri sendiri.",
        ],
        [
          s.hero_cliche_stack === true,
          "HERO_CLICHE",
          "HIGH",
          "Hero klise lengkap: kicker + judul + subjudul + 2 tombol + 3 kartu fitur ikon.",
        ],
        [
          (s.section_scaffolds_repeated ?? 0) > ANTI_SLOP_THRESHOLDS.max_repeated_section_scaffolds,
          "SECTION_SCAFFOLD_REPEATED",
          "MEDIUM",
          `${s.section_scaffolds_repeated} section memakai scaffold identik.`,
        ],
        [
          s.motion_unmapped === true,
          "MOTION_UNMAPPED",
          "HIGH",
          "Animasi tidak memetakan ke perubahan state atau navigasi.",
        ],
        [
          s.browser_surfaces_themed === false,
          "BROWSER_SURFACES_UNTHEMED",
          "MEDIUM",
          "::selection, caret, scrollbar, focus ring, atau tabular-nums belum ditema.",
        ],
        [
          s.reduced_motion_respected === false,
          "REDUCED_MOTION_IGNORED",
          "BLOCKER",
          "prefers-reduced-motion diabaikan.",
        ],
        [
          (s.copy_forbidden_hits ?? []).length > 0,
          "COPY_FORBIDDEN",
          "HIGH",
          `Copy memuat frasa terlarang: ${(s.copy_forbidden_hits ?? []).join("; ")}`,
        ],
      ];

      checked += rules.length;
      for (const [failed, code, severity, message] of rules) {
        if (failed) push(code, severity, message, spec.feature_id);
      }
    }

    // ---------- Bagian 3: Operational surface (kelengkapan dasar) ----------
    if (spec.surface_class === "operational_surface" && spec.status !== "INHERITED") {
      checked += 1;
      if (
        ui_allowed_for_render(spec) &&
        !spec.options.some((o) => o.patterns.some((p) => p.startsWith("operational:")))
      ) {
        push(
          "OPERATIONAL_BASELINE_MISSING",
          "MEDIUM",
          "Operational surface belum menyatakan pola dasarnya (density token, tabel, keyboard, status).",
          spec.feature_id,
        );
      }
    }

    return {
      status: violations.length === 0 ? "PASS" : "FAIL",
      code: violations.length === 0 ? 0 : 10,
      violations,
      metrics: {
        checked_criteria: checked,
        violations_count: violations.length,
        options_count: spec.options.length,
      },
    };
  }
}

function ui_allowed_for_render(spec: DesignDirectionSpec): boolean {
  return spec.ui_code_requested && UI_ALLOWED_STATUS.has(spec.status);
}
