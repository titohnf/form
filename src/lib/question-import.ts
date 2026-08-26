import { parseCsv } from "@/lib/csv";
import type { QuestionType } from "@/lib/types";

/**
 * Menerjemahkan satu berkas CSV menjadi calon soal bank.
 *
 * Bentuknya satu baris satu soal, dengan kolom bernama di baris pertama. Urutan
 * kolom bebas dan namanya tidak peka huruf besar–kecil: berkas ini disusun
 * orang di Excel, bukan mesin, dan menuntut urutan persis hanya melahirkan
 * berkas yang ditolak karena alasan yang tidak ada hubungannya dengan soalnya.
 *
 * Yang TIDAK diimpor lewat sini: menjodohkan, mengurutkan, isian rumpang, dan
 * grid kategori. Keempatnya butuh daftar berpasangan atau kunci per baris yang
 * tidak muat di satu baris tabel tanpa aturan sandi yang harus dihafal — lebih
 * jujur menolaknya daripada memberi format yang akan salah dipakai.
 */
export interface ImportedItem {
  type: QuestionType;
  prompt: string;
  options: { choices: string[] } | null;
  correct_answer: unknown;
  weight: number;
  explanation: string | null;
  bloom_level: number | null;
}

/** Satu baris berkas, beserta alasannya kalau ia tidak bisa jadi soal. */
export interface ImportRow {
  /** Nomor baris di berkas seperti yang dilihat orang di Excel (kepala = 1). */
  nomor: number;
  prompt: string;
  item: ImportedItem | null;
  masalah: string | null;
}

export interface ImportResult {
  rows: ImportRow[];
  /** Kolom yang tidak dikenali — dibiarkan, tapi dikatakan. */
  kolomAsing: string[];
  /** Terisi kalau berkasnya sendiri tidak bisa dipakai. */
  fatal: string | null;
}

const KOLOM_PILIHAN = ["a", "b", "c", "d", "e", "f"];

/** Nama kolom yang dikenali, dipetakan ke maknanya. */
const ALIAS: Record<string, string> = {
  tipe: "tipe",
  "tipe soal": "tipe",
  jenis: "tipe",
  pertanyaan: "prompt",
  soal: "prompt",
  prompt: "prompt",
  kunci: "kunci",
  "kunci jawaban": "kunci",
  jawaban: "kunci",
  bobot: "bobot",
  level: "level",
  bloom: "level",
  "level bloom": "level",
  pembahasan: "pembahasan",
  penjelasan: "pembahasan",
};

const TIPE: Record<string, QuestionType> = {
  "": "mcq_single",
  pg: "mcq_single",
  "pilihan ganda": "mcq_single",
  mcq: "mcq_single",
  pgk: "mcq_multi",
  mcma: "mcq_multi",
  "pilihan ganda kompleks": "mcq_multi",
  "pilihan ganda kompleks (mcma)": "mcq_multi",
  bs: "true_false",
  "benar salah": "true_false",
  "benar/salah": "true_false",
  isian: "short_answer",
  "isian singkat": "short_answer",
  esai: "essay",
  essay: "essay",
};

export function parseImport(text: string): ImportResult {
  const baris = parseCsv(text);
  if (baris.length === 0) return { rows: [], kolomAsing: [], fatal: "Berkasnya kosong." };

  const kepala = baris[0].map((h) => h.trim().toLowerCase());
  const kolomAsing: string[] = [];
  const indeks: Record<string, number> = {};
  const pilihanKe: Record<string, number> = {};

  kepala.forEach((nama, i) => {
    const pilihan = nama.match(/^(?:pilihan[ _]?)([a-f])$/);
    if (pilihan) {
      pilihanKe[pilihan[1]] = i;
      return;
    }
    const makna = ALIAS[nama];
    if (makna) indeks[makna] = i;
    else if (nama) kolomAsing.push(baris[0][i].trim());
  });

  if (indeks.prompt === undefined) {
    return {
      rows: [],
      kolomAsing,
      fatal:
        'Tidak ada kolom "pertanyaan". Baris pertama berkas harus berisi nama kolom — unduh templatnya kalau ragu.',
    };
  }

  const rows = baris.slice(1).map((sel, i) => bacaBaris(sel, i + 2, indeks, pilihanKe));
  return { rows, kolomAsing, fatal: null };
}

function bacaBaris(
  sel: string[],
  nomor: number,
  indeks: Record<string, number>,
  pilihanKe: Record<string, number>,
): ImportRow {
  const ambil = (nama: string) =>
    indeks[nama] === undefined ? "" : (sel[indeks[nama]] ?? "").trim();

  const prompt = ambil("prompt");
  const gagal = (masalah: string): ImportRow => ({ nomor, prompt, item: null, masalah });

  if (!prompt) return gagal("pertanyaannya kosong");

  const tipeTeks = ambil("tipe").toLowerCase();
  const type = TIPE[tipeTeks];
  if (!type) return gagal(`tipe "${ambil("tipe")}" tidak dikenali`);

  const bobotTeks = ambil("bobot");
  const weight = bobotTeks ? Number(bobotTeks.replace(",", ".")) : 1;
  if (!Number.isFinite(weight) || weight <= 0) return gagal(`bobot "${bobotTeks}" bukan angka`);

  const levelTeks = ambil("level").toLowerCase().replace("c", "");
  const bloom_level = levelTeks ? Number(levelTeks) : null;
  if (bloom_level !== null && !(bloom_level >= 1 && bloom_level <= 6)) {
    return gagal(`level "${ambil("level")}" di luar C1–C6`);
  }

  const explanation = ambil("pembahasan") || null;
  const kunci = ambil("kunci");
  const dasar = { type, prompt, weight, explanation, bloom_level };

  if (type === "essay") {
    return {
      nomor,
      prompt,
      item: { ...dasar, options: null, correct_answer: null },
      masalah: null,
    };
  }

  if (type === "short_answer") {
    // Beberapa variasi jawaban dipisah "|", bukan koma: koma sering jadi bagian
    // jawabannya sendiri ("Rp1.500, per kilogram").
    const kunciList = kunci
      .split("|")
      .map((k) => k.trim())
      .filter(Boolean);
    if (kunciList.length === 0) return gagal("kunci jawaban kosong");
    return {
      nomor,
      prompt,
      item: { ...dasar, options: null, correct_answer: kunciList },
      masalah: null,
    };
  }

  if (type === "true_false") {
    const benar = /^(b|benar|true|ya)$/i.test(kunci);
    const salah = /^(s|salah|false|tidak)$/i.test(kunci);
    if (!benar && !salah) return gagal(`kunci "${kunci}" harus Benar atau Salah`);
    return {
      nomor,
      prompt,
      item: { ...dasar, options: null, correct_answer: benar ? "true" : "false" },
      masalah: null,
    };
  }

  // Pilihan ganda, tunggal maupun kompleks.
  const choices: string[] = [];
  const hurufKe = new Map<string, string>();
  for (const huruf of KOLOM_PILIHAN) {
    const i = pilihanKe[huruf];
    if (i === undefined) continue;
    const teks = (sel[i] ?? "").trim();
    if (!teks) continue;
    choices.push(teks);
    hurufKe.set(huruf, teks);
  }
  if (choices.length < 2) return gagal("butuh minimal 2 kolom pilihan yang terisi");

  // Kuncinya boleh ditulis sebagai huruf kolomnya ("B", atau "A,C" untuk MCMA)
  // atau sebagai teks jawabannya. Huruf dicoba lebih dulu karena itu yang
  // dipakai hampir semua naskah soal.
  const potongan = kunci
    .split(/[,;|]/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (potongan.length === 0) return gagal("kunci jawaban kosong");

  const terpilih: string[] = [];
  for (const p of potongan) {
    const lewatHuruf = hurufKe.get(p.toLowerCase());
    const lewatTeks = choices.find((c) => c.toLowerCase() === p.toLowerCase());
    const jawaban = lewatHuruf ?? lewatTeks;
    if (!jawaban) return gagal(`kunci "${p}" tidak cocok dengan satu pun pilihan`);
    if (!terpilih.includes(jawaban)) terpilih.push(jawaban);
  }

  if (type === "mcq_single" && terpilih.length > 1) {
    return gagal("pilihan ganda biasa hanya boleh punya satu kunci — pakai tipe MCMA");
  }

  return {
    nomor,
    prompt,
    item: {
      ...dasar,
      options: { choices },
      correct_answer: type === "mcq_multi" ? terpilih : terpilih[0],
    },
    masalah: null,
  };
}

/** Templat kosong beserta satu baris contoh tiap tipe yang didukung. */
export function templatCsv(): string {
  const baris = [
    [
      "tipe",
      "pertanyaan",
      "pilihan a",
      "pilihan b",
      "pilihan c",
      "pilihan d",
      "kunci",
      "bobot",
      "level",
      "pembahasan",
    ],
    [
      "pg",
      "Hasil dari 12 : 4 adalah…",
      "2",
      "3",
      "4",
      "6",
      "B",
      "1",
      "C2",
      "12 dibagi 4 sama dengan 3.",
    ],
    ["mcma", "Manakah yang merupakan bilangan prima?", "2", "4", "7", "9", "A,C", "1", "C2", ""],
    ["benar salah", "Semua bilangan genap habis dibagi 2.", "", "", "", "", "Benar", "1", "C1", ""],
    ["isian", "Ibukota Indonesia adalah…", "", "", "", "", "Jakarta|DKI Jakarta", "1", "C1", ""],
    ["esai", "Jelaskan cara menghitung luas segitiga.", "", "", "", "", "", "2", "C3", ""],
  ];
  return baris.map((r) => r.map(sel).join(",")).join("\r\n");
}

function sel(nilai: string): string {
  return /[",\n]/.test(nilai) ? `"${nilai.replace(/"/g, '""')}"` : nilai;
}
