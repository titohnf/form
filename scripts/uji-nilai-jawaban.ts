/**
 * Penjaga aturan skoring: `nilai_jawaban()` di Postgres harus tetap memberi
 * angka yang sama seperti saat ia menggantikan dua salinan TypeScript-nya.
 *
 * Riwayatnya penting untuk membaca berkas ini. Versi pertamanya menjalankan
 * TIGA implementasi atas kasus yang sama — SQL, `gradeAnswer()` di Sora, dan
 * `nilaiJawaban()` di Tera — dan menuntut ketiganya sama persis. Keempat puluh
 * kasus lolos, dan barulah kedua berkas TypeScript itu dihapus (migrasi 137).
 *
 * Yang tersisa di kolom `harap` di bawah adalah angka DARI RUN ITU: bukan
 * tebakan penulisnya, melainkan perilaku yang sudah terbukti sama di ketiga
 * tempat. Sejak kedua salinan TS hilang, perbandingan tiga arah tidak mungkin
 * lagi dilakukan — jadi angka itu yang menggantikannya sebagai pembanding, dan
 * berkas ini berubah dari pembuktian sekali pakai jadi tes regresi permanen.
 *
 * Kasusnya sengaja memuat sudut-sudut anehnya, bukan cuma jalur bahagia. Dua
 * di antaranya adalah CACAT YANG DIPORT SENGAJA (lihat catatan di kasusnya) —
 * kalau FR5 nanti memperbaikinya, angka harapannya yang harus ikut berubah
 * dengan sadar di sini, bukan tesnya yang dilonggarkan.
 *
 * Jalankan: npx tsx scripts/uji-nilai-jawaban.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

interface Kasus {
  nama: string;
  tipe: string;
  opsi: unknown;
  kunci: unknown;
  jawaban: unknown;
  bobot?: number;
  /** Default 'sederhana' — perilaku kuis tutor, yang tidak boleh bergeser. */
  skema?: "sederhana" | "pengukuran";
}

/**
 * Kasusnya sengaja memuat sudut-sudut anehnya, bukan cuma jalur bahagia —
 * himpunan kosong yang terhitung benar, baris grid yang belum ditandai tutor,
 * jawaban yang bentuknya sama sekali bukan yang diharapkan. Justru di situlah
 * dua implementasi paling mungkin berbeda diam-diam.
 */
const KASUS: Kasus[] = [
  // mcq_single & true_false
  { nama: "pg: benar", tipe: "mcq_single", opsi: { choices: ["A", "B"] }, kunci: "B", jawaban: "B" },
  { nama: "pg: salah", tipe: "mcq_single", opsi: { choices: ["A", "B"] }, kunci: "B", jawaban: "A" },
  { nama: "pg: spasi & besar-kecil", tipe: "mcq_single", opsi: null, kunci: "Benar", jawaban: "  benar " },
  { nama: "pg: jawaban kosong", tipe: "mcq_single", opsi: null, kunci: "B", jawaban: null },
  { nama: "pg: kunci angka", tipe: "mcq_single", opsi: null, kunci: 5, jawaban: "5" },
  { nama: "bs: benar", tipe: "true_false", opsi: null, kunci: true, jawaban: true },
  { nama: "bs: salah", tipe: "true_false", opsi: null, kunci: true, jawaban: false },
  { nama: "bs: string vs boolean", tipe: "true_false", opsi: null, kunci: true, jawaban: "true" },

  // short_answer
  { nama: "isian: kunci tunggal", tipe: "short_answer", opsi: null, kunci: "12", jawaban: "12" },
  { nama: "isian: daftar kunci", tipe: "short_answer", opsi: null, kunci: ["12", "dua belas"], jawaban: "Dua Belas" },
  { nama: "isian: tidak cocok", tipe: "short_answer", opsi: null, kunci: ["12"], jawaban: "13" },
  { nama: "isian: kunci kosong", tipe: "short_answer", opsi: null, kunci: [], jawaban: "12" },

  // mcq_multi
  { nama: "mcma: sama persis", tipe: "mcq_multi", opsi: { choices: ["A", "B", "C"] }, kunci: ["A", "B"], jawaban: ["B", "A"] },
  { nama: "mcma: kurang satu", tipe: "mcq_multi", opsi: { choices: ["A", "B", "C"] }, kunci: ["A", "B"], jawaban: ["A"] },
  { nama: "mcma: kelebihan distraktor", tipe: "mcq_multi", opsi: null, kunci: ["A"], jawaban: ["A", "C"] },
  { nama: "mcma: dua-duanya kosong", tipe: "mcq_multi", opsi: null, kunci: [], jawaban: [] },
  { nama: "mcma: jawaban bukan array", tipe: "mcq_multi", opsi: null, kunci: ["A"], jawaban: "A" },
  { nama: "mcma: kunci bukan array, jawaban bukan array", tipe: "mcq_multi", opsi: null, kunci: "A", jawaban: "A" },
  { nama: "mcma: duplikat di jawaban", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["A", "B", "B"] },

  // matching
  {
    nama: "jodoh: semua benar",
    tipe: "matching",
    opsi: { pairs: [{ left: "1", right: "satu" }, { left: "2", right: "dua" }] },
    kunci: null,
    jawaban: { "1": "satu", "2": "Dua" },
  },
  {
    nama: "jodoh: satu meleset",
    tipe: "matching",
    opsi: { pairs: [{ left: "1", right: "satu" }, { left: "2", right: "dua" }] },
    kunci: null,
    jawaban: { "1": "satu", "2": "tiga" },
  },
  { nama: "jodoh: tanpa pasangan", tipe: "matching", opsi: { pairs: [] }, kunci: null, jawaban: {} },
  {
    nama: "jodoh: jawaban kosong",
    tipe: "matching",
    opsi: { pairs: [{ left: "1", right: "satu" }] },
    kunci: null,
    jawaban: null,
  },

  // ordering
  { nama: "urut: benar", tipe: "ordering", opsi: { items: ["a", "b", "c"] }, kunci: null, jawaban: ["a", "b", "c"] },
  { nama: "urut: tertukar", tipe: "ordering", opsi: { items: ["a", "b", "c"] }, kunci: null, jawaban: ["b", "a", "c"] },
  { nama: "urut: kurang panjang", tipe: "ordering", opsi: { items: ["a", "b", "c"] }, kunci: null, jawaban: ["a", "b"] },
  { nama: "urut: tanpa item", tipe: "ordering", opsi: { items: [] }, kunci: null, jawaban: [] },

  // fill_blank
  { nama: "rumpang: dua dari dua", tipe: "fill_blank", opsi: null, kunci: ["a", "b"], jawaban: ["a", "b"], bobot: 2 },
  { nama: "rumpang: satu dari dua", tipe: "fill_blank", opsi: null, kunci: ["a", "b"], jawaban: ["a", "z"], bobot: 2 },
  { nama: "rumpang: satu dari tiga", tipe: "fill_blank", opsi: null, kunci: ["a", "b", "c"], jawaban: ["a"], bobot: 1 },
  { nama: "rumpang: kunci kosong", tipe: "fill_blank", opsi: null, kunci: [], jawaban: ["a"] },
  { nama: "rumpang: jawaban bukan array", tipe: "fill_blank", opsi: null, kunci: ["a"], jawaban: "a" },

  // statement_grid
  {
    nama: "grid: proporsional 2/3",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q", "r"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, false, true], grading_mode: "proportional" },
    jawaban: [true, false, false],
    bobot: 3,
  },
  {
    nama: "grid: all_or_nothing kurang satu",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, true], grading_mode: "all_or_nothing" },
    jawaban: [true, false],
    bobot: 2,
  },
  {
    nama: "grid: all_or_nothing penuh",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, true], grading_mode: "all_or_nothing" },
    jawaban: [true, true],
    bobot: 2,
  },
  {
    nama: "grid: baris belum ditandai tutor",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, null], grading_mode: "proportional" },
    jawaban: [true, null],
    bobot: 2,
  },
  {
    nama: "grid: jawaban lebih pendek",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q", "r"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, true, true], grading_mode: "proportional" },
    jawaban: [true],
    bobot: 3,
  },
  {
    nama: "grid: tanpa pernyataan",
    tipe: "statement_grid",
    opsi: { statements: [], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [], grading_mode: "proportional" },
    jawaban: [],
  },

  // Tidak dinilai otomatis
  { nama: "esai", tipe: "essay", opsi: null, kunci: null, jawaban: "jawaban panjang" },
  { nama: "unggah berkas", tipe: "upload_file", opsi: null, kunci: null, jawaban: "berkas.png" },

  // ---- Skema 'pengukuran' (FR5, migrasi 138) --------------------------------
  //
  // Nilai harapan di bawah ini BUKAN dari run sebelumnya seperti kasus di atas
  // — tidak ada perilaku lama untuk dibandingkan. Semuanya diturunkan tangan
  // dari formula di dokumen fondasi Bagian 3.4, dan hitungannya ditulis di
  // komentar tiap baris supaya bisa diperiksa tanpa menjalankan apa pun.

  // Correction for guessing: benar +bobot, salah −bobot (k=2). Nilai negatif
  // per butir memang disengaja; lantainya dipasang saat menjumlahkan paket.
  { nama: "ukur/bs: benar", tipe: "true_false", opsi: null, kunci: true, jawaban: true, skema: "pengukuran" },
  { nama: "ukur/bs: salah", tipe: "true_false", opsi: null, kunci: true, jawaban: false, skema: "pengukuran" },
  { nama: "ukur/bs: salah, bobot 2", tipe: "true_false", opsi: null, kunci: true, jawaban: false, bobot: 2, skema: "pengukuran" },

  // Partial credit: max(0, (benar dipilih − salah dipilih) / total benar).
  { nama: "ukur/mcma: penuh", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["A", "B"], skema: "pengukuran" },
  { nama: "ukur/mcma: separuh", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["A"], skema: "pengukuran" },
  { nama: "ukur/mcma: satu benar satu distraktor", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["A", "C"], skema: "pengukuran" },
  { nama: "ukur/mcma: semua benar plus distraktor", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["A", "B", "C"], skema: "pengukuran" },
  { nama: "ukur/mcma: dua distraktor saja", tipe: "mcq_multi", opsi: null, kunci: ["A", "B"], jawaban: ["C", "D"], skema: "pengukuran" },
  { nama: "ukur/mcma: penuh, bobot 2", tipe: "mcq_multi", opsi: null, kunci: ["A", "B", "C", "D"], jawaban: ["A", "B", "C", "D"], bobot: 2, skema: "pengukuran" },
  { nama: "ukur/mcma: tidak memilih apa pun", tipe: "mcq_multi", opsi: null, kunci: ["A"], jawaban: [], skema: "pengukuran" },
  { nama: "ukur/mcma: kunci kosong", tipe: "mcq_multi", opsi: null, kunci: [], jawaban: ["A"], skema: "pengukuran" },

  // Dua tingkat. Aturannya tidak bergantung skema, jadi diuji di keduanya.
  {
    nama: "dua tingkat: keduanya benar",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: { tier1: true, tier2: "B" },
    jawaban: { tier1: true, tier2: "B" },
    skema: "pengukuran",
  },
  {
    nama: "dua tingkat: alasan salah",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: { tier1: true, tier2: "B" },
    jawaban: { tier1: true, tier2: "C" },
    skema: "pengukuran",
  },
  {
    nama: "dua tingkat: alasan salah, skor_sebagian 0.25 bobot 2",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: { tier1: true, tier2: "B", skor_sebagian: 0.25 },
    jawaban: { tier1: true, tier2: "C" },
    bobot: 2,
    skema: "pengukuran",
  },
  {
    nama: "dua tingkat: tingkat 1 salah, alasan benar",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: { tier1: true, tier2: "B" },
    jawaban: { tier1: false, tier2: "B" },
    skema: "pengukuran",
  },
  {
    nama: "dua tingkat: di skema sederhana pun sama",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: { tier1: true, tier2: "B" },
    jawaban: { tier1: true, tier2: "C" },
  },
  {
    nama: "dua tingkat: kunci tanpa tingkat",
    tipe: "true_false_two_tier",
    opsi: null,
    kunci: {},
    jawaban: {},
    skema: "pengukuran",
  },

  // Tipe yang skemanya TIDAK mengubah apa pun. Ini yang membuktikan
  // 'pengukuran' tidak diam-diam menyentuh yang tidak disebut FR5.
  { nama: "ukur/pg: tetap biner", tipe: "mcq_single", opsi: null, kunci: "B", jawaban: "A", skema: "pengukuran" },
  { nama: "ukur/rumpang: tetap sama", tipe: "fill_blank", opsi: null, kunci: ["a", "b"], jawaban: ["a", "z"], bobot: 2, skema: "pengukuran" },
  {
    nama: "ukur/grid: tetap sama",
    tipe: "statement_grid",
    opsi: { statements: ["p", "q", "r"], answer_labels: ["Benar", "Salah"] },
    kunci: { answers: [true, false, true], grading_mode: "proportional" },
    jawaban: [true, false, false],
    bobot: 3,
    skema: "pengukuran",
  },
];

/**
 * Angka yang tercatat saat ketiga implementasi masih ada dan ketiganya setuju.
 *
 * Dua baris yang perlu dibaca dua kali, keduanya CACAT LAMA yang diport
 * sengaja, bukan perilaku yang dibela:
 *
 * - `mcma: kunci bukan array, jawaban bukan array` = nilai PENUH. Dua himpunan
 *   kosong terhitung sama di `setsEqual`, jadi soal multi-select yang kuncinya
 *   salah bentuk memberi angka sempurna untuk jawaban apa pun. FR5 menulis
 *   ulang cabang ini jadi partial credit dan seharusnya menutupnya.
 * - `mcma: dua-duanya kosong` = nilai penuh, karena alasan yang sama persis.
 *
 * Kalau FR5 mengubah keduanya, angka di sini yang diperbarui — dengan catatan
 * kenapa, di baris yang sama. Tesnya jangan dilonggarkan.
 */
const HARAP: Record<string, number | null> = {
  "pg: benar": 1,
  "pg: salah": 0,
  "pg: spasi & besar-kecil": 1,
  "pg: jawaban kosong": 0,
  "pg: kunci angka": 1,
  "bs: benar": 1,
  "bs: salah": 0,
  "bs: string vs boolean": 1,
  "isian: kunci tunggal": 1,
  "isian: daftar kunci": 1,
  "isian: tidak cocok": 0,
  "isian: kunci kosong": 0,
  "mcma: sama persis": 1,
  "mcma: kurang satu": 0,
  "mcma: kelebihan distraktor": 0,
  "mcma: dua-duanya kosong": 1,
  "mcma: jawaban bukan array": 0,
  "mcma: kunci bukan array, jawaban bukan array": 1,
  "mcma: duplikat di jawaban": 1,
  "jodoh: semua benar": 1,
  "jodoh: satu meleset": 0,
  "jodoh: tanpa pasangan": 0,
  "jodoh: jawaban kosong": 0,
  "urut: benar": 1,
  "urut: tertukar": 0,
  "urut: kurang panjang": 0,
  "urut: tanpa item": 0,
  "rumpang: dua dari dua": 2,
  "rumpang: satu dari dua": 1,
  "rumpang: satu dari tiga": 1 / 3,
  "rumpang: kunci kosong": 0,
  "rumpang: jawaban bukan array": 0,
  "grid: proporsional 2/3": 2,
  "grid: all_or_nothing kurang satu": 0,
  "grid: all_or_nothing penuh": 2,
  "grid: baris belum ditandai tutor": 1,
  "grid: jawaban lebih pendek": 1,
  "grid: tanpa pernyataan": 0,
  esai: null,
  "unggah berkas": null,

  // FR5 — diturunkan dari formula, bukan dari perilaku lama. Hitungannya
  // ditulis di sini supaya bisa diperiksa tanpa menjalankan apa pun.
  "ukur/bs: benar": 1,
  "ukur/bs: salah": -1, //                      salah → −bobot (k=2)
  "ukur/bs: salah, bobot 2": -2,
  "ukur/mcma: penuh": 1, //                     (2−0)/2 = 1
  "ukur/mcma: separuh": 0.5, //                 (1−0)/2 = 0,5
  "ukur/mcma: satu benar satu distraktor": 0, // (1−1)/2 = 0
  "ukur/mcma: semua benar plus distraktor": 0.5, // (2−1)/2 = 0,5
  "ukur/mcma: dua distraktor saja": 0, //       (0−2)/2 = −1 → lantai 0
  "ukur/mcma: penuh, bobot 2": 2, //            (4−0)/4 = 1, ×2
  "ukur/mcma: tidak memilih apa pun": 0, //     (0−0)/1 = 0
  "ukur/mcma: kunci kosong": 0, //              tanpa opsi benar: tak terukur
  "dua tingkat: keduanya benar": 1,
  "dua tingkat: alasan salah": 0.5, //          default skor_sebagian
  "dua tingkat: alasan salah, skor_sebagian 0.25 bobot 2": 0.5, // 2 × 0,25
  "dua tingkat: tingkat 1 salah, alasan benar": 0, // alasan benar tidak menolong
  "dua tingkat: di skema sederhana pun sama": 0.5,
  "dua tingkat: kunci tanpa tingkat": 0, //     kunci salah bentuk: nol, bukan penuh
  "ukur/pg: tetap biner": 0,
  "ukur/rumpang: tetap sama": 1,
  "ukur/grid: tetap sama": 2,
};

/** Dibulatkan supaya 1/3 dari dua sistem angka tidak berbeda di digit ke-15. */
function bandingkan(n: number | null): string {
  return n === null ? "null" : n.toFixed(6);
}

async function main() {
  let gagal = 0;

  for (const kasus of KASUS) {
    const bobot = kasus.bobot ?? 1;

    if (!(kasus.nama in HARAP)) {
      console.error(`✗ ${kasus.nama}: belum punya nilai harapan di HARAP`);
      gagal++;
      continue;
    }

    const { data: sql, error } = await db.rpc("nilai_jawaban", {
      p_tipe: kasus.tipe,
      p_opsi: kasus.opsi ?? null,
      p_kunci: kasus.kunci ?? null,
      p_jawaban: kasus.jawaban ?? null,
      p_bobot: bobot,
      p_skema: kasus.skema ?? "sederhana",
    });
    if (error) {
      console.error(`✗ ${kasus.nama}: galat SQL — ${error.message}`);
      gagal++;
      continue;
    }

    const dapat = bandingkan(sql === null ? null : Number(sql));
    const harap = bandingkan(HARAP[kasus.nama]);

    if (dapat === harap) {
      console.log(`✓ ${kasus.nama.padEnd(44)} ${dapat}`);
    } else {
      console.error(`✗ ${kasus.nama.padEnd(44)} dapat=${dapat} harap=${harap}`);
      gagal++;
    }
  }

  // Skema yang salah eja harus meledak, bukan diam-diam dinilai 'sederhana'.
  // Diuji karena kegagalan senyap di sini berarti paket pengukuran dinilai
  // dengan aturan kuis biasa tanpa seorang pun tahu.
  const ngawur = await db.rpc("nilai_jawaban", {
    p_tipe: "true_false",
    p_opsi: null,
    p_kunci: true,
    p_jawaban: false,
    p_bobot: 1,
    p_skema: "ngawur",
  });
  if (ngawur.error) {
    console.log(`✓ ${"skema tidak dikenal ditolak".padEnd(44)} ${ngawur.error.message.slice(0, 40)}`);
  } else {
    console.error(`✗ ${"skema tidak dikenal ditolak".padEnd(44)} malah dinilai ${ngawur.data}`);
    gagal++;
  }

  console.log(`\n${KASUS.length + 1 - gagal}/${KASUS.length + 1} kasus sesuai nilai harapan.`);
  if (gagal > 0) {
    console.error(
      `${gagal} kasus MENYIMPANG dari perilaku yang sudah terbukti. ` +
        `Kalau penyimpangannya disengaja (mis. FR5), perbarui HARAP beserta alasannya.`,
    );
    process.exit(1);
  }
}

main();
