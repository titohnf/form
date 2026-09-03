"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { missingColumn, without } from "@/lib/missing-column";
import type { QuestionPatch } from "@/lib/types";
import type { ImportedItem } from "@/lib/question-import";
import { KOLOM_METADATA, type MetadataPengukuran, type Peruntukan } from "@/lib/metadata-pengukuran";
import type { ItemJson } from "@/lib/soal-json";

/** Kolom yang menyusul lewat migrasi; boleh belum ada saat kode ini berjalan. */
const OPTIONAL_COLUMNS = ["bloom_level", ...KOLOM_METADATA];

/**
 * Menyimpan suntingan satu soal bank.
 *
 * Dipanggil sekali, saat tombol "Simpan perubahan" ditekan — bukan tiap
 * ketikan. Editornya menahan suntingan di ingatan halaman sampai saat itu,
 * supaya tombol Simpan benar-benar menyimpan dan tombol Batal benar-benar
 * membatalkan.
 *
 * `branching` dibuang: ia menunjuk sesama soal di dalam satu paket, dan soal
 * bank tidak punya itu.
 */
export async function saveBankItem(
  itemId: string,
  patch: QuestionPatch,
  /**
   * Metadata pengukuran ikut di sini, bukan lewat aksi sendiri, supaya satu
   * tombol "Simpan perubahan" benar-benar menyimpan semua yang barusan diubah.
   * Aksi terpisah berarti dua tulisan yang bisa setengah berhasil, dan yang
   * tertinggal bukan galat melainkan butir yang metadatanya diam-diam versi
   * lama. Hanya bank yang punya kolom ini — soal di dalam paket tidak.
   */
  meta?: MetadataPengukuran,
) {
  const supabase = await createClient();
  const { branching: _branching, ...isiSoal } = patch;
  void _branching;
  const content = meta ? { ...isiSoal, ...meta } : isiSoal;

  // Kolom yang menyusul lewat migrasi dibuang satu per satu kalau belum ada.
  const dropped: string[] = [];
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt += 1) {
    const { error } = await supabase
      .from("question_bank_items")
      .update(without({ ...content }, dropped))
      .eq("id", itemId);

    const missing = missingColumn(error, OPTIONAL_COLUMNS);
    if (!missing) {
      // Sekali simpan, sekali segarkan: daftar topik dan halaman soalnya sama-
      // sama menampilkan isi yang barusan berubah. Dulu ini tidak boleh ada —
      // menyegarkan server tiap ketikan membuat editor berkedip.
      revalidatePath("/dashboard/bank", "layout");
      return;
    }
    dropped.push(missing);
  }
}

/**
 * Menyimpan draf soal pertama kalinya.
 *
 * Barisnya baru lahir di sini, bukan saat tombol "+ Soal Baru" ditekan. Dulu
 * tombol itu langsung menyisipkan soal kosong lalu memindahkan orang ke
 * editornya; siapa pun yang berubah pikiran — menutup tab, menekan Batal,
 * salah klik — meninggalkan satu baris "Pertanyaan masih kosong" di topiknya,
 * dan yang menemukannya belakangan tidak pernah tahu itu sisa siapa. Draf yang
 * ditinggalkan sekarang tidak meninggalkan apa-apa.
 *
 * Topiknya wajib: soal tanpa topik tidak pernah muncul di Latihan Soal murid.
 */
/**
 * Butir pengukuran baru — ditulis langsung ke sebuah topik peta kompetensi,
 * tanpa pernah menyinggung bab kurikulum.
 *
 * KENAPA TIDAK MENUMPANG `simpanSoalBaru`. Aksi itu MEWAJIBKAN `groupId` dan
 * selalu menyisipkan `question_curriculum_tags` — sementara trigger migrasi
 * tera 148 melarang butir ber-`topik_id` punya tag kurikulum sama sekali.
 * Akibatnya, sampai hari ini butir pengukuran hanya bisa lahir lewat impor
 * JSON, atau lewat jalan memutar: ditulis di sebuah bab yang tidak ada
 * hubungannya, lalu diberi topik supaya triggernya membuang tag yang barusan
 * dipasang. Jalan memutar itu bekerja, tapi ia mengajarkan bahwa bab yang
 * ditanyakan di layar boleh diisi asal-asalan.
 *
 * LAHIR SEBAGAI `draf`, seperti butir mana pun (migrasi 141). Yang ditulis
 * tangan di sini belum diverifikasi matematis oleh siapa pun, dan
 * `topik_paket_items` hanya menyajikan butir aktif — jadi butir ini tidak akan
 * sampai ke murid mana pun sampai seseorang menaikkannya sendiri.
 *
 * `peruntukan` ditanyakan di depan, bukan disusulkan: `semai_paket_topik`
 * memperlakukan butir tanpa kolam sebagai butir latihan lewat `coalesce`, jadi
 * butir ujian yang lupa diberi kolam tidak gagal — ia diam-diam masuk paket
 * latihan, dan kolam ujian yang seharusnya eksklusif ikut bocor bersamanya.
 */
export async function simpanButirPengukuranBaru(
  topikId: string,
  patch: QuestionPatch,
  peruntukan: Peruntukan | null,
) {
  if (!topikId) throw new Error("Topik pengukurannya belum ditentukan.");
  if (!patch.prompt.trim()) throw new Error("Pertanyaannya masih kosong.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah berakhir. Masuk lagi, lalu simpan ulang.");

  const { branching: _branching, ...isi } = patch;
  void _branching;

  const dibuang: string[] = [];
  let created: { id: string } | null = null;
  for (let percobaan = 0; percobaan <= OPTIONAL_COLUMNS.length; percobaan += 1) {
    const { data, error } = await supabase
      .from("question_bank_items")
      .insert(
        without({ ...isi, created_by: user.id, topik_id: topikId, peruntukan }, dibuang),
      )
      .select("id")
      .single();

    if (!error) {
      created = data;
      break;
    }
    const hilang = missingColumn(error, OPTIONAL_COLUMNS);
    // `topik_id` yang belum ada bukan kolom yang boleh dibuang di sini seperti
    // di impor: membuangnya berarti menyimpan butir yang tidak diukur sebagai
    // apa pun, di layar yang seluruh alasannya adalah topik itu.
    if (!hilang || hilang === "topik_id") {
      throw new Error(
        hilang === "topik_id"
          ? "Peta kompetensi belum ada di database ini (migrasi tera 143 belum jalan)."
          : error.message,
      );
    }
    dibuang.push(hilang);
  }
  if (!created) throw new Error("Butirnya gagal disimpan.");

  revalidatePath("/dashboard/bank/pengukuran", "layout");
  return created.id;
}

export async function simpanSoalBaru(groupId: string, patch: QuestionPatch) {
  if (!groupId) throw new Error("Topiknya belum ditentukan.");
  if (!patch.prompt.trim()) throw new Error("Pertanyaannya masih kosong.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah berakhir. Masuk lagi, lalu simpan ulang.");

  const { branching: _branching, ...isi } = patch;
  void _branching;

  // Kolom yang menyusul lewat migrasi dibuang satu per satu kalau belum ada,
  // sama seperti `saveBankItem`.
  const dibuang: string[] = [];
  let created: { id: string } | null = null;
  for (let percobaan = 0; percobaan <= OPTIONAL_COLUMNS.length; percobaan += 1) {
    const { data, error } = await supabase
      .from("question_bank_items")
      .insert(without({ ...isi, created_by: user.id }, dibuang))
      .select("id")
      .single();

    if (!error) {
      created = data;
      break;
    }
    const hilang = missingColumn(error, OPTIONAL_COLUMNS);
    if (!hilang) throw new Error(error.message);
    dibuang.push(hilang);
  }
  if (!created) throw new Error("Soalnya gagal disimpan.");

  const { error: tagError } = await supabase
    .from("question_curriculum_tags")
    .insert({ question_bank_item_id: created.id, group_id: groupId });
  if (tagError) {
    throw new Error(
      `Soalnya tersimpan tapi topiknya gagal ditandai: ${tagError.message}. ` +
        "Cari di bagian “Belum ditandai topik”.",
    );
  }

  revalidatePath("/dashboard/bank");
  revalidatePath(`/dashboard/bank/${groupId}`);
  return created.id;
}

/**
 * Menyimpan soal hasil impor ke satu topik — dari CSV maupun JSON.
 *
 * Barisnya sudah divalidasi di klien sebelum sampai ke sini; yang dikirim cuma
 * yang bersih. Insert-nya sekali jalan supaya 200 soal tidak jadi 200 perjalanan.
 *
 * Butir masuk sebagai `draf`, sama seperti yang ditulis manual: tidak ada jalur
 * impor yang boleh memintas alur verifikasi.
 */
export async function addImportedBankItems(
  /**
   * Bab kurikulum tujuannya, atau null untuk impor jalur pengukuran.
   *
   * Null bukan "lupa diisi": butir bertopik memang tidak punya bab, dan halaman
   * Pengukuran mengimpor tanpa pernah menanyakannya. Menuntut bab di sana
   * berarti menuntut jawaban yang akan diabaikan — dan pertanyaan yang
   * jawabannya diabaikan mengajari orang bahwa isian di layar ini tidak berarti
   * apa-apa.
   */
  groupId: string | null,
  items: (ImportedItem & Partial<ItemJson>)[],
) {
  if (items.length === 0) return 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Metadata pengukuran hanya terisi untuk impor JSON; impor CSV tidak
  // membawanya, dan `undefined` di sini tidak ikut terkirim ke database.
  const baris = items.map((q) => ({
    created_by: user.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    correct_answer: q.correct_answer,
    weight: q.weight,
    explanation: q.explanation,
    bloom_level: q.bloom_level,
    penjelasan_per_opsi: q.penjelasan_per_opsi,
    pola_solo: q.pola_solo,
    elemen_proses: q.elemen_proses,
    label_kategori: q.label_kategori,
    sumber_pembuatan: q.sumber_pembuatan,
    peruntukan: q.peruntukan,
    topik_id: q.topik_id,
  }));

  // Kolom yang menyusul lewat migrasi dibuang satu per satu kalau belum ada,
  // menumpuk seperti di `saveBankItem` — sebuah lingkungan bisa tertinggal
  // lebih dari satu migrasi, dan mencoba sekali per kolom tidak akan pernah
  // sampai ke kombinasi yang benar.
  let created: { id: string }[] | null = null;
  const dibuang: string[] = [];
  for (let percobaan = 0; percobaan <= OPTIONAL_COLUMNS.length; percobaan += 1) {
    const { data, error } = await supabase
      .from("question_bank_items")
      .insert(baris.map((b) => without({ ...b }, dibuang)))
      .select("id");
    if (!error) {
      created = data;
      break;
    }
    const hilang = missingColumn(error, OPTIONAL_COLUMNS);
    if (!hilang) throw new Error(error.message);
    dibuang.push(hilang);
  }
  if (!created?.length) return 0;

  // Butir yang punya topik pengukuran TIDAK ditandai ke grup kurikulum.
  //
  // Untuk butir itu, peta kompetensi adalah satu-satunya jalur penyajian —
  // dan tag grup justru yang akan menyeretnya kembali ke latihan bebas,
  // termasuk butir paket ujian yang kolamnya harus eksklusif. Database
  // menolaknya sejak migrasi tera 148; di sini ia tidak dikirim sejak awal,
  // supaya impor tidak gagal separuh jalan hanya untuk diberi tahu hal yang
  // sudah kita ketahui.
  //
  // Bank Soal menjelajahi butir seperti ini lewat topiknya, bukan lewat bab.
  //
  // Mana yang bertopik ditanyakan ulang ke database, bukan dicocokkan dengan
  // urutan `items` di sini: `insert ... returning` memang MENGEMBALIKAN baris
  // sesuai urutan masuk dalam praktiknya, tapi itu tidak dijamin — dan kalau
  // suatu saat meleset, akibatnya bukan galat melainkan butir ujian yang
  // ditandai ke bab dan diam-diam bocor ke latihan bebas.
  //
  // Kalau pertanyaannya sendiri gagal, kita berhenti — menandai semua butir
  // sebagai jalan pintas justru melakukan hal yang seharusnya dicegah.
  // Kecuali satu hal: di database yang kolom `topik_id`-nya memang belum ada,
  // tidak ada butir yang bisa bertopik, jadi semuanya memang perlu ditandai.
  const { data: tanpaTopik, error: topikError } = await supabase
    .from("question_bank_items")
    .select("id")
    .in("id", created.map((row) => row.id))
    .is("topik_id", null);
  if (topikError && !missingColumn(topikError, ["topik_id"])) {
    throw new Error(
      `${created.length} soal tersimpan tapi topiknya belum ditandai: ${topikError.message}. ` +
        "Cari di bagian “Belum ditandai topik”.",
    );
  }

  const perluTag = groupId === null ? [] : (tanpaTopik ?? created);
  if (perluTag.length === 0) {
    revalidatePath("/dashboard/bank", "layout");
    return created.length;
  }

  const { error: tagError } = await supabase
    .from("question_curriculum_tags")
    .insert(perluTag.map((row) => ({ question_bank_item_id: row.id, group_id: groupId! })));
  if (tagError) {
    throw new Error(
      `${created.length} soal tersimpan tapi topiknya gagal ditandai: ${tagError.message}. ` +
        "Cari di bagian “Belum ditandai topik”.",
    );
  }

  revalidatePath("/dashboard/bank");
  revalidatePath(`/dashboard/bank/${groupId}`);
  return created.length;
}

/**
 * Memindahkan satu butir ke tahap verifikasi berikutnya (FR1).
 *
 * Menyimpan seketika, tidak menunggu tombol "Simpan perubahan" — sama seperti
 * tag topik, karena ini bukan isi soal melainkan pernyataan tentang soalnya:
 * "saya sudah memeriksa hitungannya". Menahannya di ingatan halaman bersama
 * suntingan lain akan membuat pernyataan itu ikut hilang kalau tabnya ditutup.
 *
 * Urutan tahapnya ditegakkan trigger di database, bukan di sini. Yang dilakukan
 * fungsi ini cuma meneruskan galatnya apa adanya — pesan dari trigger sudah
 * menyebut dari mana ke mana lompatannya, dan menuliskan ulang aturan yang sama
 * di sini berarti dua tempat yang bisa berbeda.
 */
export async function ubahStatusVerifikasi(itemId: string, status: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("question_bank_items")
    .update({ status_verifikasi: status })
    .eq("id", itemId);

  if (error) {
    // Kolomnya belum ada berarti migrasi 141 belum jalan — bukan kesalahan
    // orang yang menekan tombolnya, jadi kalimatnya menyebut sebabnya.
    if (missingColumn(error, ["status_verifikasi"])) {
      throw new Error("Status verifikasi belum aktif di database ini (migrasi 141 belum jalan).");
    }
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/bank", "layout");
}

export async function deleteBankItem(itemId: string) {
  const supabase = await createClient();
  await supabase.from("question_bank_items").delete().eq("id", itemId);
  revalidatePath("/dashboard/bank", "layout");
}

/**
 * Adds or removes one curriculum tag. The tag points at a topic group's stable
 * id, so renaming the topic in Tera does not detach the question and deleting it
 * cleans the tag up by cascade.
 */
export async function toggleQuestionTopic(itemId: string, groupId: string, tagged: boolean) {
  const supabase = await createClient();

  if (tagged) {
    await supabase
      .from("question_curriculum_tags")
      .upsert({ question_bank_item_id: itemId, group_id: groupId });
  } else {
    await supabase
      .from("question_curriculum_tags")
      .delete()
      .eq("question_bank_item_id", itemId)
      .eq("group_id", groupId);
  }
  // Segmennya: menandai satu soal memindahkannya keluar dari "Belum ditandai
  // topik" sekaligus mengubah hitungan di tabel, bukan cuma topik yang diklik.
  revalidatePath("/dashboard/bank", "layout");
}
