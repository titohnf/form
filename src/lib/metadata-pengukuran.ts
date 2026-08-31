/**
 * Metadata yang membuat sebuah butir bisa dipakai sebagai instrumen ukur, bukan
 * sekadar disajikan.
 *
 * Semuanya hanya ada di `question_bank_items`, tidak di `questions` — soal di
 * dalam sebuah paket adalah salinan untuk dikerjakan, sementara yang diukur dan
 * dikalibrasi adalah butir di banknya. Karena itu field-field ini hidup di
 * kartu Bank Soal, bukan di `QuestionEditor` yang dipakai bersama editor paket.
 *
 * Kolomnya datang dari migrasi tera 141.
 */

/**
 * Elemen Proses resmi CP Matematika. Satu butir boleh menekankan lebih dari
 * satu, jadi array.
 *
 * Gunanya bukan pelaporan yang lebih ramai: ia yang menjaga bank soal tidak
 * timpang hanya menguji satu jenis proses berpikir — sesuatu yang tidak
 * kelihatan dari sebaran level Bloom saja (Learning Progression Bagian 2).
 */
export const ELEMEN_PROSES = [
  { value: "penalaran", label: "Penalaran" },
  { value: "pemecahan_masalah", label: "Pemecahan Masalah" },
  { value: "komunikasi", label: "Komunikasi" },
  { value: "representasi", label: "Representasi" },
  { value: "koneksi", label: "Koneksi" },
] as const;

export type ElemenProses = (typeof ELEMEN_PROSES)[number]["value"];

/**
 * Pola SOLO yang dirancang untuk soal multi-select (dokumen fondasi 2.3).
 *
 * Ini bukan label hasil, melainkan RANCANGAN: penulisnya menyatakan pola
 * jawaban seperti apa yang hendak dibedakan oleh susunan opsinya — memilih satu
 * aspek benar saja (unistruktural), beberapa benar tapi ikut termakan distraktor
 * mirip (multistruktural), atau tepat semuanya sambil menolak semua distraktor
 * (relasional).
 */
export const POLA_SOLO = [
  { value: "unistruktural", label: "Unistruktural", arti: "Cukup satu aspek benar yang terlihat" },
  {
    value: "multistruktural",
    label: "Multistruktural",
    arti: "Beberapa benar, tapi distraktor mirip masih ikut terpilih",
  },
  {
    value: "relasional",
    label: "Relasional",
    arti: "Tepat semua yang benar, dan menolak semua distraktor",
  },
] as const;

export type PolaSolo = (typeof POLA_SOLO)[number]["value"];

/** Konteks gaya PISA. Hanya relevan C4 ke atas, jadi kosong untuk seluruh butir pilot. */
export const KONTEKS_PISA = [
  { value: "personal", label: "Personal" },
  { value: "occupational", label: "Pekerjaan" },
  { value: "societal", label: "Kemasyarakatan" },
  { value: "scientific", label: "Saintifik" },
] as const;

export type KonteksPisa = (typeof KONTEKS_PISA)[number]["value"];

/**
 * Siapa yang menulis drafnya. `ai_generated_verified` BUKAN "dibuat AI" —
 * akhiran `verified` bagian dari artinya: draf AI yang belum lewat verifikasi
 * matematis independen tidak pernah sampai ke status ini, karena ia tidak
 * pernah sampai ke status `aktif` sama sekali (dokumen fondasi Bagian 3.12).
 */
export const SUMBER_PEMBUATAN = [
  { value: "manual", label: "Ditulis manusia" },
  { value: "ai_generated_verified", label: "Draf AI, terverifikasi" },
] as const;

export type SumberPembuatan = (typeof SUMBER_PEMBUATAN)[number]["value"];

/**
 * Penjelasan tiap opsi, untuk analisis distraktor (dokumen fondasi 3.10).
 *
 * BERKUNCI INDEKS OPSI ("0", "1", …), bukan teks opsinya. Teks opsi berubah
 * setiap kali penulisnya memperbaiki kalimat, dan penjelasan yang terikat pada
 * teks lama akan menggantung tanpa pemilik pada perbaikan pertama. Indeks
 * bertahan selama urutan opsinya tidak diacak-acak — dan kalau memang diacak,
 * yang salah tempat kelihatan langsung di editornya, bukan diam-diam di data.
 */
export type PenjelasanPerOpsi = Record<string, string>;

export interface MetadataPengukuran {
  penjelasan_per_opsi: PenjelasanPerOpsi | null;
  pola_solo: PolaSolo | null;
  elemen_proses: ElemenProses[] | null;
  tag_konteks_pisa: KonteksPisa | null;
  sumber_pembuatan: SumberPembuatan;
}

/** Nilai awal untuk butir yang kolomnya masih kosong. */
export const METADATA_KOSONG: MetadataPengukuran = {
  penjelasan_per_opsi: null,
  pola_solo: null,
  elemen_proses: null,
  tag_konteks_pisa: null,
  sumber_pembuatan: "manual",
};

/** Kolom metadata yang boleh belum ada saat kode ini berjalan (pola `missing-column`). */
export const KOLOM_METADATA = [
  "penjelasan_per_opsi",
  "pola_solo",
  "elemen_proses",
  "tag_konteks_pisa",
  "sumber_pembuatan",
  "label_kategori",
];
