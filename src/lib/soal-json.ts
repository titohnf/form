import type { QuestionType } from "@/lib/types";
import type { ElemenProses, PolaSolo, SumberPembuatan } from "@/lib/metadata-pengukuran";
import type { ImportRow } from "@/lib/question-import";

/**
 * Membaca naskah soal berformat JSON — bentuk yang dipakai tim konten saat
 * menulis butir untuk pilot.
 *
 * Kenapa ada di samping impor CSV dan bukan menggantikannya: CSV muat untuk
 * naskah yang isinya satu baris satu soal dengan kolom datar, dan itu bentuk
 * yang paling nyaman disusun di spreadsheet. Tapi ia tidak bisa membawa hal
 * yang justru paling menentukan mutu butir sebagai alat ukur — penjelasan
 * untuk TIAP opsi, yang menjadikan "opsi B paling sering dipilih" terbaca
 * sebagai miskonsepsi tertentu alih-alih angka tanpa arti. JSON membawanya
 * tanpa aturan sandi yang harus dihafal.
 *
 * Nama fieldnya mengikuti Skema Data Sistem (`konten_soal`, `kunci_jawaban`,
 * `pola_solo`), bukan nama kolom database — naskahnya ditulis mengikuti
 * dokumen, dan penerjemahan ke kolom terjadi di sini.
 */

/** Format soal seperti ditulis dokumen, dipetakan ke tipe yang dipakai sistem. */
const FORMAT: Record<string, QuestionType> = {
  pg_tunggal: "mcq_single",
  multi_select: "mcq_multi",
  bs_satu_tingkat: "true_false",
  isian_angka: "short_answer",
};

const ELEMEN_SAH = new Set([
  "penalaran",
  "pemecahan_masalah",
  "komunikasi",
  "representasi",
  "koneksi",
]);

const SOLO_SAH = new Set(["unistruktural", "multistruktural", "relasional"]);

/**
 * Satu butir siap simpan. Memperluas bentuk impor CSV dengan metadata
 * pengukuran dan peruntukan kolam — dua hal yang tidak muat di CSV.
 */
export interface ItemJson {
  type: QuestionType;
  prompt: string;
  options: { choices: string[] } | null;
  correct_answer: unknown;
  weight: number;
  explanation: string | null;
  bloom_level: number | null;
  penjelasan_per_opsi: Record<string, string> | null;
  pola_solo: PolaSolo | null;
  elemen_proses: ElemenProses[] | null;
  label_kategori: { positif: string; negatif: string } | null;
  sumber_pembuatan: SumberPembuatan;
  peruntukan: "latihan" | "ujian" | null;
  /** Topik pengukuran (Learning Progression). Tepat satu, atau null. */
  topik_id: string | null;
}

/**
 * Satu butir di berkas, beserta alasannya kalau ia tidak bisa disimpan.
 *
 * `catatan` berbeda dari `masalah`: ia tidak menghalangi penyimpanan, tapi
 * menyebutkan apa yang diabaikan — supaya data yang dibuang dikatakan, bukan
 * hilang diam-diam.
 */
export interface BarisJson extends Omit<ImportRow, "item"> {
  item: ItemJson | null;
  catatan: string | null;
}

export interface HasilJson {
  rows: BarisJson[];
  fatal: string | null;
}

function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai.trim() : "";
}

function samakan(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Bentuk kode topik: `[Fase]-[nomor 2 digit]`, cerminan check di migrasi 140. */
const POLA_KODE_TOPIK = /^[A-F]{1,2}-[0-9]{2}$/;

/**
 * @param kodeSah Daftar kode topik yang benar-benar ada di database. Kalau
 *   diberikan, kode di luar daftar ditolak SAAT BACA — bukan saat insert, yang
 *   akan menggagalkan seluruh berkas gara-gara satu baris. Kalau tidak
 *   diberikan (mis. tabelnya belum ada), yang diperiksa cuma bentuk kodenya.
 */
export function parseSoalJson(isi: string, kodeSah?: Set<string>): HasilJson {
  let mentah: unknown;
  try {
    mentah = JSON.parse(isi);
  } catch (e) {
    return {
      rows: [],
      fatal: `Berkasnya bukan JSON yang sah — ${e instanceof Error ? e.message : "gagal dibaca"}.`,
    };
  }

  if (!Array.isArray(mentah)) {
    return { rows: [], fatal: "Isinya harus berupa daftar soal, dibuka dengan [ dan ditutup dengan ]." };
  }
  if (mentah.length === 0) {
    return { rows: [], fatal: "Daftarnya kosong." };
  }

  return { rows: mentah.map((butir, i) => bacaButir(butir, i + 1, kodeSah)), fatal: null };
}

function bacaButir(mentah: unknown, nomor: number, kodeSah?: Set<string>): BarisJson {
  const b = (mentah ?? {}) as Record<string, unknown>;
  const prompt = teks(b.konten_soal);
  const gagal = (masalah: string): BarisJson => ({ nomor, prompt, item: null, masalah, catatan: null });

  if (!prompt) return gagal("konten_soal kosong");

  const formatTeks = teks(b.format).toLowerCase();
  if (formatTeks === "bs_dua_tingkat") {
    // Ditolak dengan jalan keluarnya, bukan diterjemahkan menebak-nebak: bentuk
    // dua tingkat butuh daftar alasan beserta penanda alasan yang benar, dan
    // menciptakan sendiri bentuk JSON-nya berarti tim konten menulis mengikuti
    // tebakan yang tidak pernah mereka sepakati.
    return gagal("bs_dua_tingkat belum bisa diimpor — tulis butir ini langsung di editor");
  }
  const type = FORMAT[formatTeks];
  if (!type) return gagal(`format "${teks(b.format) || "(kosong)"}" tidak dikenali`);

  // Level ditulis "C1" di naskah, disimpan sebagai angka 1.
  const levelTeks = teks(b.level_bloom).toLowerCase().replace("c", "");
  const bloom_level = levelTeks ? Number(levelTeks) : null;
  if (bloom_level !== null && !(bloom_level >= 1 && bloom_level <= 6)) {
    return gagal(`level_bloom "${teks(b.level_bloom)}" di luar C1–C6`);
  }

  const opsi = Array.isArray(b.opsi) ? b.opsi.map((o) => teks(o)).filter(Boolean) : [];
  const penjelasan = Array.isArray(b.penjelasan_per_opsi)
    ? b.penjelasan_per_opsi.map((p) => teks(p))
    : [];

  const catatan: string[] = [];

  // --- kunci jawaban, per format ---
  let correct_answer: unknown;
  let options: { choices: string[] } | null = null;
  let label_kategori: { positif: string; negatif: string } | null = null;

  if (type === "mcq_single") {
    if (opsi.length < 2) return gagal("butuh minimal 2 opsi");
    const kunci = teks(b.kunci_jawaban);
    // Kunci harus benar-benar salah satu opsinya. Kunci yang tidak cocok
    // membuat SETIAP jawaban dinilai salah — dan itu tidak akan terlihat
    // sebagai galat, cuma sebagai butir yang tidak pernah bisa dijawab benar.
    const cocok = opsi.find((o) => samakan(o, kunci));
    if (!cocok) return gagal(`kunci_jawaban "${kunci}" tidak sama dengan satu pun opsinya`);
    options = { choices: opsi };
    correct_answer = cocok;
  } else if (type === "mcq_multi") {
    if (opsi.length < 2) return gagal("butuh minimal 2 opsi");
    const daftar = Array.isArray(b.kunci_jawaban)
      ? b.kunci_jawaban.map((k) => teks(k)).filter(Boolean)
      : [teks(b.kunci_jawaban)].filter(Boolean);
    if (daftar.length === 0) return gagal("kunci_jawaban kosong");
    const terpetakan = daftar.map((k) => opsi.find((o) => samakan(o, k)));
    const meleset = daftar.filter((_, i) => !terpetakan[i]);
    if (meleset.length > 0) {
      return gagal(`kunci_jawaban "${meleset.join(", ")}" tidak sama dengan satu pun opsinya`);
    }
    options = { choices: opsi };
    correct_answer = terpetakan as string[];
  } else if (type === "true_false") {
    const kunci = teks(b.kunci_jawaban);
    const positif = opsi[0] || "Benar";
    const negatif = opsi[1] || "Salah";
    const benar = samakan(kunci, positif) || /^(benar|true|ya)$/i.test(kunci);
    const salah = samakan(kunci, negatif) || /^(salah|false|tidak)$/i.test(kunci);
    if (!benar && !salah) return gagal(`kunci_jawaban "${kunci}" bukan "${positif}" maupun "${negatif}"`);
    correct_answer = benar ? "true" : "false";
    // Labelnya disimpan supaya grid yang kategorinya bukan Benar/Salah literal
    // ("Mungkin/Tidak Mungkin") tetap tampil sebagaimana ditulis naskahnya.
    if (opsi.length >= 2) label_kategori = { positif, negatif };
  } else {
    // short_answer — beberapa ejaan yang sama-sama diterima dipisah "|".
    const kunci = teks(b.kunci_jawaban);
    if (!kunci) return gagal("kunci_jawaban kosong");
    correct_answer = kunci
      .split("|")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  // --- penjelasan per opsi ---
  //
  // Untuk butir tanpa opsi, penjelasan per opsi tidak punya tempat menempel —
  // isinya jadi pembahasan umum. Itu memang maksudnya di naskah: satu kalimat
  // yang menjelaskan jawabannya, bukan satu kalimat per pilihan.
  let penjelasan_per_opsi: Record<string, string> | null = null;
  let explanation = teks(b.pembahasan) || null;

  if (opsi.length === 0) {
    if (penjelasan.length > 0) explanation = explanation ?? penjelasan.join(" ");
  } else if (penjelasan.length > 0) {
    if (penjelasan.length !== opsi.length) {
      catatan.push(`penjelasan_per_opsi ada ${penjelasan.length}, opsinya ${opsi.length}`);
    }
    const peta: Record<string, string> = {};
    opsi.forEach((_, i) => {
      if (penjelasan[i]) peta[String(i)] = penjelasan[i];
    });
    penjelasan_per_opsi = Object.keys(peta).length > 0 ? peta : null;
  }

  // --- metadata ---
  //
  // Pola SOLO hanya bermakna pada multi-select: ia menggambarkan pola MEMILIH
  // beberapa opsi — satu aspek benar saja, beberapa benar tapi ikut termakan
  // distraktor, atau tepat semuanya. Pada soal berjawaban tunggal tidak ada
  // yang bisa dibedakan, jadi nilainya diabaikan dan pengabaiannya dikatakan.
  const soloTeks = teks(b.pola_solo).toLowerCase();
  let pola_solo: PolaSolo | null = null;
  if (soloTeks) {
    if (!SOLO_SAH.has(soloTeks)) catatan.push(`pola_solo "${soloTeks}" tidak dikenali, diabaikan`);
    else if (type !== "mcq_multi") catatan.push("pola_solo diabaikan — hanya bermakna untuk multi-select");
    else pola_solo = soloTeks as PolaSolo;
  }

  const elemenMentah = Array.isArray(b.elemen_proses) ? b.elemen_proses.map((e) => teks(e)) : [];
  const elemen = elemenMentah.filter((e) => ELEMEN_SAH.has(e));
  const elemenAsing = elemenMentah.filter((e) => e && !ELEMEN_SAH.has(e));
  if (elemenAsing.length > 0) catatan.push(`elemen_proses "${elemenAsing.join(", ")}" tidak dikenali`);

  // Topik pengukuran. Ditolak keras kalau salah, tidak diabaikan seperti
  // pola_solo: butir tanpa topik yang benar tidak ikut menghitung penguasaan
  // apa pun, dan itu kehilangan yang tidak terlihat di layar mana pun.
  const topikTeks = teks(b.topik).toUpperCase();
  let topik_id: string | null = null;
  if (topikTeks) {
    if (!POLA_KODE_TOPIK.test(topikTeks)) {
      return gagal(`topik "${topikTeks}" bukan kode yang sah — bentuknya seperti D-01`);
    }
    if (kodeSah && !kodeSah.has(topikTeks)) {
      return gagal(`topik "${topikTeks}" tidak ada di peta kompetensi`);
    }
    topik_id = topikTeks;
  }

  const paketTeks = teks(b.paket).toLowerCase();
  let peruntukan: "latihan" | "ujian" | null = null;
  if (paketTeks === "latihan" || paketTeks === "ujian") peruntukan = paketTeks;
  else if (paketTeks) catatan.push(`paket "${paketTeks}" tidak dikenali`);

  const bobot = Number(b.bobot);
  const sumberTeks = teks(b.sumber_pembuatan);

  return {
    nomor,
    prompt,
    masalah: null,
    catatan: catatan.length > 0 ? catatan.join("; ") : null,
    item: {
      type,
      prompt,
      options,
      correct_answer,
      weight: Number.isFinite(bobot) && bobot > 0 ? bobot : 1,
      explanation,
      bloom_level,
      penjelasan_per_opsi,
      pola_solo,
      elemen_proses: elemen.length > 0 ? (elemen as ElemenProses[]) : null,
      label_kategori,
      // Bawaannya draf AI: jalur JSON inilah alur produksi berbantuan AI di
      // dokumen fondasi Bagian 3.12, dan naskah yang ditulis tangan lebih
      // sering datang lewat CSV. Bisa ditimpa per butir lewat field
      // `sumber_pembuatan`.
      //
      // Perlu dibaca benar: kolom ini mencatat ASAL naskah, bukan pernyataan
      // bahwa butirnya sudah diverifikasi. Yang menyatakan itu `status_verifikasi`,
      // dan butir hasil impor tetap mendarat sebagai `draf`.
      sumber_pembuatan:
        sumberTeks === "manual" || sumberTeks === "ai_generated_verified"
          ? (sumberTeks as SumberPembuatan)
          : "ai_generated_verified",
      peruntukan,
      topik_id,
    },
  };
}

/**
 * Contoh naskah JSON — satu butir per format yang didukung.
 *
 * Dibangkitkan dari berkas yang sama dengan pembacanya, dengan alasan yang
 * sama seperti templat CSV: contoh dan pembacanya tidak boleh berpisah, karena
 * contoh yang usang mengajarkan bentuk yang akan ditolak.
 */
export function contohSoalJson(): string {
  return JSON.stringify(
    [
      {
        level_bloom: "C1",
        format: "pg_tunggal",
        konten_soal: "Manakah hubungan yang benar antara bilangan -7 dan -3?",
        opsi: ["-7 > -3", "-7 < -3", "-7 = -3", "-7 > 3"],
        kunci_jawaban: "-7 < -3",
        penjelasan_per_opsi: [
          "Salah. Pada garis bilangan, -7 ada di sebelah kiri -3, jadi nilainya lebih kecil.",
          "Benar. -7 lebih kecil daripada -3 karena posisinya lebih ke kiri.",
          "Salah. Keduanya bilangan yang berbeda.",
          "Salah. -7 bukan lebih besar dari 3.",
        ],
        elemen_proses: ["penalaran"],
        topik: "D-01",
        paket: "latihan",
      },
      {
        level_bloom: "C2",
        format: "multi_select",
        konten_soal: "Pilih semua pernyataan yang benar tentang sifat operasi bilangan bulat.",
        opsi: [
          "Penjumlahan bersifat komutatif",
          "Pengurangan bersifat komutatif",
          "Perkalian bersifat asosiatif",
        ],
        kunci_jawaban: ["Penjumlahan bersifat komutatif", "Perkalian bersifat asosiatif"],
        penjelasan_per_opsi: [
          "Benar. 3 + 5 dan 5 + 3 sama-sama 8.",
          "Salah. 9 - 4 = 5, sedangkan 4 - 9 = -5.",
          "Benar. Pengelompokan faktor tidak mengubah hasil kali.",
        ],
        // Hanya bermakna di sini, pada soal yang jawabannya lebih dari satu.
        pola_solo: "relasional",
        topik: "D-01",
        paket: "ujian",
      },
      {
        level_bloom: "C1",
        format: "bs_satu_tingkat",
        konten_soal: "Sifat komutatif berlaku pada pengurangan bilangan bulat.",
        opsi: ["Benar", "Salah"],
        kunci_jawaban: "Salah",
        penjelasan_per_opsi: [
          "Salah. Pengurangan tidak komutatif: 9 - 4 = 5, tetapi 4 - 9 = -5.",
          "Benar. Komutatif berlaku pada penjumlahan dan perkalian, bukan pengurangan.",
        ],
        topik: "D-01",
        paket: "latihan",
      },
      {
        level_bloom: "C1",
        format: "isian_angka",
        konten_soal: "Hasil dari -5 + 5 adalah ...",
        opsi: [],
        kunci_jawaban: "0",
        // Tanpa opsi, penjelasannya jadi pembahasan umum.
        penjelasan_per_opsi: ["Jawaban benar: 0. Keduanya bilangan berlawanan, jadi jumlahnya nol."],
        topik: "D-01",
        paket: "latihan",
      },
    ],
    null,
    2,
  );
}
