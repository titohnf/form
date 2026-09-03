import type {
  MatchingPair,
  QuestionOptions,
  QuestionType,
  StatementGridGradingMode,
} from "@/lib/types";
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
  bs_dua_tingkat: "true_false_two_tier",
  isian_angka: "short_answer",
  kisi_pernyataan: "statement_grid",
  menjodohkan: "matching",
  mengurutkan: "ordering",
};

/**
 * Kata yang dibaca sebagai benar atau salah.
 *
 * Naskah menulis kunci Benar-Salah dengan kata, bukan dengan `true`/`false`
 * JSON — dan menuntut boolean di berkas yang seluruh isinya kalimat Indonesia
 * adalah menuntut penulisnya berpindah bahasa di satu field saja. Keduanya
 * diterima; yang tidak diterima adalah kata ketiga, karena kunci yang tidak
 * terbaca membuat SETIAP jawaban dinilai salah tanpa ada yang tahu kenapa.
 */
function boolNaskah(nilai: unknown): boolean | null {
  if (typeof nilai === "boolean") return nilai;
  const t = teks(nilai).toLowerCase();
  if (/^(benar|true|ya|b|betul)$/.test(t)) return true;
  if (/^(salah|false|tidak|s|keliru)$/.test(t)) return false;
  return null;
}

/** Mode penilaian kisi seperti ditulis naskah, dipetakan ke nilai kolomnya. */
const MODE_KISI: Record<string, StatementGridGradingMode> = {
  proporsional: "proportional",
  semua_atau_tidak: "all_or_nothing",
};

/** Label dua tombol jawaban, dipakai kisi pernyataan dan dua tingkat. */
function labelJawaban(nilai: unknown): [string, string] {
  const daftar = Array.isArray(nilai) ? nilai.map((v) => teks(v)) : [];
  return [daftar[0] || "Benar", daftar[1] || "Salah"];
}

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
  options: QuestionOptions;
  correct_answer: unknown;
  weight: number;
  explanation: string | null;
  bloom_level: number | null;
  penjelasan_per_opsi: Record<string, string> | null;
  pola_solo: PolaSolo | null;
  elemen_proses: ElemenProses[] | null;
  label_kategori: { positif: string; negatif: string } | null;
  sumber_pembuatan: SumberPembuatan;
  peruntukan: "latihan" | "ujian" | "probe" | null;
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
 * @param untukKurikulum Kalau true, field `topik` di JSON diabaikan — soal akan
 *   ditandai ke topik kurikulum (groupId), bukan ke topik pengukuran. Pakai
 *   ini saat impor dari halaman Bank Soal.
 */
export function parseSoalJson(
  isi: string,
  kodeSah?: Set<string>,
  untukKurikulum?: boolean,
): HasilJson {
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

  return { rows: mentah.map((butir, i) => bacaButir(butir, i + 1, kodeSah, untukKurikulum)), fatal: null };
}

function bacaButir(
  mentah: unknown,
  nomor: number,
  kodeSah?: Set<string>,
  untukKurikulum?: boolean,
): BarisJson {
  const b = (mentah ?? {}) as Record<string, unknown>;
  const prompt = teks(b.konten_soal);
  const gagal = (masalah: string): BarisJson => ({ nomor, prompt, item: null, masalah, catatan: null });

  if (!prompt) return gagal("konten_soal kosong");

  const formatTeks = teks(b.format).toLowerCase();
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
  let options: QuestionOptions = null;
  let label_kategori: { positif: string; negatif: string } | null = null;
  // Daftar yang `penjelasan_per_opsi` sejajar dengannya.
  //
  // Untuk pilihan ganda itu opsinya. Untuk kisi, pernyataannya. Untuk dua
  // tingkat, ALASANNYA — dan itu bukan pilihan sembarang: alasan yang salah di
  // sebuah butir dua tingkat justru tempat miskonsepsinya tinggal, jadi
  // "alasan mana yang paling sering dipilih" adalah bentuk analisis distraktor
  // yang paling berarti pada format ini. Menyejajarkannya dengan dua tombol
  // Benar/Salah di tingkat 1 tidak akan pernah menjelaskan apa pun.
  let sejajar: string[] = opsi;

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
  } else if (type === "statement_grid") {
    const pernyataan = Array.isArray(b.pernyataan)
      ? b.pernyataan.map((v) => teks(v)).filter(Boolean)
      : [];
    // Dua, bukan satu. Kisi berisi satu pernyataan adalah soal Benar-Salah yang
    // ditulis dengan bentuk yang lebih rumit, dan skoringnya pun berbeda:
    // koreksi tebakan pada kisi membagi per baris (migrasi tera 178), jadi kisi
    // satu baris diam-diam menilai dengan aturan yang bukan miliknya.
    if (pernyataan.length < 2) {
      return gagal("kisi_pernyataan butuh minimal 2 pernyataan — satu pernyataan saja tulis sebagai bs_satu_tingkat");
    }
    const kunciMentah = Array.isArray(b.kunci_jawaban) ? b.kunci_jawaban : [];
    if (kunciMentah.length !== pernyataan.length) {
      return gagal(
        `kunci_jawaban ada ${kunciMentah.length}, pernyataannya ${pernyataan.length} — harus sama banyak dan urut`,
      );
    }
    const answers = kunciMentah.map((k) => boolNaskah(k));
    const tanpaKunci = answers
      .map((a, i) => (a === null ? i + 1 : 0))
      .filter((n) => n > 0);
    // Baris tanpa kunci TIDAK diterima sebagai "belum diisi", meski kolomnya
    // mengizinkan null: butir yang mendarat di bank dengan baris kosong akan
    // dinilai dengan penyebut yang lebih kecil daripada yang dilihat murid,
    // dan tidak ada satu layar pun yang mengatakannya.
    if (tanpaKunci.length > 0) {
      return gagal(`kunci pernyataan ke-${tanpaKunci.join(", ")} bukan "benar" maupun "salah"`);
    }
    const modeTeks = teks(b.mode_penilaian).toLowerCase();
    let grading_mode: StatementGridGradingMode = "proportional";
    if (modeTeks) {
      if (!MODE_KISI[modeTeks]) {
        catatan.push(`mode_penilaian "${modeTeks}" tidak dikenali, dipakai proporsional`);
      } else grading_mode = MODE_KISI[modeTeks];
    }
    const label = teks(b.label_pernyataan);
    options = {
      statements: pernyataan,
      answer_labels: labelJawaban(b.label_jawaban),
      ...(label ? { statement_label: label } : {}),
    };
    correct_answer = { answers: answers as boolean[], grading_mode };
    sejajar = pernyataan;
  } else if (type === "true_false_two_tier") {
    const alasan = Array.isArray(b.alasan) ? b.alasan.map((a) => teks(a)).filter(Boolean) : [];
    if (alasan.length < 2) return gagal("bs_dua_tingkat butuh minimal 2 pilihan di field `alasan`");
    const kunci = (b.kunci_jawaban ?? {}) as Record<string, unknown>;
    const tier1 = boolNaskah(kunci.tingkat1);
    if (tier1 === null) {
      return gagal('kunci_jawaban.tingkat1 harus "benar" atau "salah"');
    }
    // Alasan yang benar ditunjuk dengan TEKSNYA di naskah, disimpan sebagai
    // indeks. Menuntut penulisnya menghitung indeks sendiri berarti menuntut
    // dia memperbarui satu angka setiap kali urutan alasan diubah — dan angka
    // yang salah di sana tidak terbaca sebagai galat, cuma sebagai butir yang
    // menilai setiap alasan sebagai keliru.
    const alasanBenar = teks(kunci.tingkat2);
    const indeks = alasan.findIndex((a) => samakan(a, alasanBenar));
    if (indeks < 0) {
      return gagal(`kunci_jawaban.tingkat2 "${alasanBenar}" tidak sama dengan satu pun alasannya`);
    }
    // Skor untuk jawaban benar beralasan keliru (FR5). Ikut di kunci, bukan
    // dipatok di kode — migrasi tera 178 membacanya dari sana dan memakai 0,5
    // kalau tidak ada.
    let skor_sebagian: number | null = null;
    if (b.skor_sebagian !== undefined && b.skor_sebagian !== null) {
      const n = Number(b.skor_sebagian);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        catatan.push(`skor_sebagian "${String(b.skor_sebagian)}" di luar 0–1, dipakai bawaan 0,5`);
      } else skor_sebagian = n;
    }
    // Tingkat 1 tidak punya label sendiri: Tera menuliskan "Benar"/"Salah"
    // langsung di layar murid, jadi `label_jawaban` di naskah dua tingkat tidak
    // akan pernah terbaca. Dikatakan, bukan disimpan diam-diam.
    if (b.label_jawaban !== undefined) {
      catatan.push("label_jawaban diabaikan — tingkat 1 selalu Benar/Salah");
    }
    options = {
      tier2_prompt: teks(b.pertanyaan_alasan) || "Alasannya:",
      tier2_choices: alasan,
    };
    // Kuncinya TEKS alasannya, dan tingkat 1 teks "true"/"false" — bentuk yang
    // dibandingkan `nilai_jawaban()` dengan jawaban yang dikirim layar murid.
    correct_answer = {
      tier1: tier1 ? "true" : "false",
      tier2: alasan[indeks],
      ...(skor_sebagian === null ? {} : { skor_sebagian }),
    };
    sejajar = alasan;
  } else if (type === "matching") {
    const pasanganMentah = Array.isArray(b.pasangan) ? b.pasangan : [];
    const pairs: MatchingPair[] = [];
    for (let i = 0; i < pasanganMentah.length; i += 1) {
      const pas = (pasanganMentah[i] ?? {}) as Record<string, unknown>;
      const left = teks(pas.kiri);
      const right = teks(pas.kanan);
      if (!left || !right) {
        return gagal(`pasangan ke-${i + 1} belum lengkap — tiap pasangan butuh "kiri" dan "kanan"`);
      }
      pairs.push({ left, right });
    }
    if (pairs.length < 2) return gagal("menjodohkan butuh minimal 2 pasangan di field `pasangan`");
    // Sisi kiri ganda ditolak, bukan digabung diam-diam: jawaban murid berkunci
    // sisi kiri (`{ "kiri": "kanan" }`), jadi dua baris berkiri sama hanya
    // menyisakan satu jawaban yang mungkin — dan pasangan yang satunya tidak
    // akan pernah bisa dijawab benar oleh siapa pun.
    const kiriGanda = pairs
      .map((p) => p.left.toLowerCase())
      .filter((v, i, a) => a.indexOf(v) !== i);
    if (kiriGanda.length > 0) {
      return gagal(`sisi kiri "${[...new Set(kiriGanda)].join(", ")}" muncul lebih dari sekali`);
    }
    options = { pairs };
    // Kuncinya ADA di `options.pairs`, dan tidak disalin ke sini: `nilai_jawaban`
    // menilai menjodohkan dari pasangannya (migrasi tera 178), jadi kunci kedua
    // di kolom ini cuma salinan yang suatu hari akan berbeda pendapat.
    correct_answer = null;
    sejajar = [];
  } else if (type === "ordering") {
    const urutan = Array.isArray(b.urutan) ? b.urutan.map((u) => teks(u)).filter(Boolean) : [];
    if (urutan.length < 2) {
      return gagal("mengurutkan butuh minimal 2 item di field `urutan`, ditulis dalam urutan yang benar");
    }
    const ganda = urutan.map((u) => u.toLowerCase()).filter((v, i, a) => a.indexOf(v) !== i);
    if (ganda.length > 0) {
      return gagal(`item "${[...new Set(ganda)].join(", ")}" muncul lebih dari sekali di urutan`);
    }
    // Sama seperti menjodohkan: urutan yang benar ADALAH urutan di `items`.
    options = { items: urutan };
    correct_answer = null;
    sejajar = [];
  } else {
    // short_answer — beberapa ejaan yang sama-sama diterima dipisah "|".
    const kunci = teks(b.kunci_jawaban);
    if (!kunci) return gagal("kunci_jawaban kosong");
    correct_answer = kunci
      .split("|")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  // Format yang tidak memakai `opsi` tidak diam-diam membuangnya: naskah yang
  // membawa opsi untuk kisi pernyataan hampir selalu naskah yang salah format,
  // dan menyimpannya tanpa berkata apa-apa berarti orangnya baru tahu setelah
  // butirnya sampai ke murid.
  if (opsi.length > 0 && sejajar !== opsi) {
    catatan.push(`opsi diabaikan — ${formatTeks} tidak memakainya`);
  }

  // --- penjelasan per opsi ---
  //
  // Untuk butir yang tidak punya daftar untuk ditempeli — isian angka,
  // menjodohkan, mengurutkan — penjelasan per opsi tidak punya tempat menempel,
  // jadi isinya jadi pembahasan umum. Itu memang maksudnya di naskah: satu
  // kalimat yang menjelaskan jawabannya, bukan satu kalimat per pilihan.
  let penjelasan_per_opsi: Record<string, string> | null = null;
  let explanation = teks(b.pembahasan) || null;

  if (sejajar.length === 0) {
    if (penjelasan.length > 0) explanation = explanation ?? penjelasan.join(" ");
  } else if (penjelasan.length > 0) {
    if (penjelasan.length !== sejajar.length) {
      catatan.push(`penjelasan_per_opsi ada ${penjelasan.length}, yang dijelaskan ${sejajar.length}`);
    }
    const peta: Record<string, string> = {};
    sejajar.forEach((_, i) => {
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
  //
  // Saat impor lewat halaman Bank Soal (`untukKurikulum`), field `topik` di
  // JSON diabaikan: soal di halaman itu mendarat di topik kurikulum yang sudah
  // dipilih pemakainya, bukan di pengukuran. Menghormati `topik` di sini akan
  // memindahkan soal itu ke pengukuran — persis kebingungan yang membuat orang
  // melaporkannya. Kode yang salah tetap dicatat supaya yang menulis naskah
  // tahu fieldnya tidak terbaca.
  const topikTeks = teks(b.topik).toUpperCase();
  let topik_id: string | null = null;
  if (topikTeks && untukKurikulum) {
    catatan.push(
      `topik "${topikTeks}" diabaikan — impor ke topik kurikulum yang dipilih, bukan pengukuran`,
    );
  } else if (topikTeks) {
    if (!POLA_KODE_TOPIK.test(topikTeks)) {
      return gagal(`topik "${topikTeks}" bukan kode yang sah — bentuknya seperti D-01`);
    }
    if (kodeSah && !kodeSah.has(topikTeks)) {
      return gagal(`topik "${topikTeks}" tidak ada di peta kompetensi`);
    }
    topik_id = topikTeks;
  }

  // Kolam butir ini. `probe` ikut sejak migrasi tera 168: butir retest berkala
  // bukan anggota paket mana pun, dan sebelum ini satu-satunya cara memasukkan
  // kolam itu adalah lewat SQL — padahal `DaftarButir` sudah memperingatkan
  // kalau kolam probe sebuah topik terlalu tipis untuk membuka retest.
  const paketTeks = teks(b.paket).toLowerCase();
  let peruntukan: ItemJson["peruntukan"] = null;
  if (paketTeks === "latihan" || paketTeks === "ujian" || paketTeks === "probe") {
    peruntukan = paketTeks;
  } else if (paketTeks) catatan.push(`paket "${paketTeks}" tidak dikenali`);

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
 * Contoh naskah JSON — satu butir per format yang didukung, bergaya naskah
 * pengukuran (membawa kode `topik`).
 *
 * Field `topik` (kode seperti `D-01`) mengarahkan butir ke topik PENGUKURAN —
 * itulah yang dipakai saat impor dari halaman Pengukuran. Kalau butirnya
 * untuk topik kurikulum di Bank Soal, field `topik` tidak perlu ada: saat
 * diimpor dari halaman Bank Soal ia diabaikan, dan soal mendarat di topik
 * kurikulum yang sudah dipilih pemakainya.
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
      {
        level_bloom: "C2",
        format: "kisi_pernyataan",
        konten_soal: "Tandai setiap pernyataan sebagai benar atau salah.",
        // Barisnya di `pernyataan`, bukan di `opsi`: yang di kisi bukan pilihan
        // yang dipilih salah satu, melainkan pernyataan yang dinilai satu per satu.
        pernyataan: [
          "-8 lebih kecil daripada -3",
          "Nilai mutlak -8 lebih kecil daripada nilai mutlak -3",
          "-8 berada di sebelah kiri -3 pada garis bilangan",
        ],
        kunci_jawaban: ["benar", "salah", "benar"],
        penjelasan_per_opsi: [
          "Benar. Semakin ke kiri, semakin kecil nilainya.",
          "Salah. |-8| = 8 dan |-3| = 3, jadi justru lebih besar — ini keliru yang paling sering: magnitude ditukar dengan posisi.",
          "Benar. Posisi di garis bilangan itulah yang menentukan besar kecilnya.",
        ],
        // Bawaannya proporsional. "semua_atau_tidak" menilai nol kalau ada satu
        // baris pun yang meleset.
        mode_penilaian: "proporsional",
        // Opsional: hanya untuk kisi yang kategorinya bukan Benar/Salah.
        label_jawaban: ["Benar", "Salah"],
        topik: "D-01",
        paket: "ujian",
      },
      {
        level_bloom: "C5",
        format: "bs_dua_tingkat",
        konten_soal: "Hasil dari -3 × (-4) adalah bilangan positif.",
        kunci_jawaban: {
          tingkat1: "benar",
          // Ditunjuk dengan teksnya, disalin persis dari daftar `alasan`.
          tingkat2: "Perkalian dua bilangan negatif menghasilkan bilangan positif",
        },
        pertanyaan_alasan: "Apa alasannya?",
        alasan: [
          "Perkalian dua bilangan negatif menghasilkan bilangan positif",
          "Tanda negatif selalu hilang saat dikalikan",
          "Hasil perkalian mengikuti tanda bilangan yang lebih besar",
        ],
        // Sejajar dengan `alasan` — di sanalah miskonsepsinya, bukan di tombol
        // Benar/Salah tingkat 1.
        penjelasan_per_opsi: [
          "Benar. Aturan tandanya: negatif × negatif = positif.",
          "Keliru. Tanda tidak hilang; -3 × 4 tetap negatif.",
          "Keliru. Besar bilangan tidak menentukan tanda hasilnya.",
        ],
        // Nilai untuk jawaban benar dengan alasan keliru. Boleh dikosongkan;
        // bawaannya 0,5.
        skor_sebagian: 0.5,
        topik: "D-01",
        paket: "ujian",
      },
      {
        level_bloom: "C2",
        format: "menjodohkan",
        konten_soal: "Pasangkan tiap operasi dengan hasilnya.",
        // Kuncinya ada di pasangannya sendiri — tidak ada field kunci_jawaban.
        pasangan: [
          { kiri: "-6 + 2", kanan: "-4" },
          { kiri: "-6 - 2", kanan: "-8" },
          { kiri: "-6 × 2", kanan: "-12" },
        ],
        pembahasan: "Perhatikan operasinya dulu, baru tandanya.",
        topik: "D-01",
        paket: "probe",
      },
      {
        level_bloom: "C3",
        format: "mengurutkan",
        konten_soal: "Urutkan bilangan berikut dari yang terkecil.",
        // DITULIS DALAM URUTAN YANG BENAR. Itu kuncinya; tidak ada field lain.
        urutan: ["-9", "-4", "0", "3", "7"],
        pembahasan: "Semakin ke kiri pada garis bilangan, semakin kecil nilainya.",
        topik: "D-01",
        paket: "latihan",
      },
    ],
    null,
    2,
  );
}
