"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { missingColumn, without } from "@/lib/missing-column";
import type { QuestionPatch } from "@/lib/types";
import type { ImportedItem } from "@/lib/question-import";

/** Kolom yang menyusul lewat migrasi; boleh belum ada saat kode ini berjalan. */
const OPTIONAL_COLUMNS = ["bloom_level"];

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
export async function saveBankItem(itemId: string, patch: QuestionPatch) {
  const supabase = await createClient();
  const { branching: _branching, ...content } = patch;
  void _branching;

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
 * Menyimpan soal hasil impor CSV ke satu topik.
 *
 * Barisnya sudah divalidasi di klien sebelum sampai ke sini; yang dikirim cuma
 * yang bersih. Insert-nya sekali jalan supaya 200 soal tidak jadi 200 perjalanan.
 */
export async function addImportedBankItems(groupId: string, items: ImportedItem[]) {
  if (!groupId || items.length === 0) return 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // `bloom_level` menyusul lewat migrasi; kalau kolomnya belum ada, soalnya
  // tetap masuk tanpa level alih-alih seluruh impor gagal.
  const baris = items.map((q) => ({
    created_by: user.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    correct_answer: q.correct_answer,
    weight: q.weight,
    explanation: q.explanation,
    bloom_level: q.bloom_level,
  }));

  let created: { id: string }[] | null = null;
  for (const kolomDibuang of [[] as string[], ["bloom_level"]]) {
    const { data, error } = await supabase
      .from("question_bank_items")
      .insert(baris.map((b) => without({ ...b }, kolomDibuang)))
      .select("id");
    if (!error) {
      created = data;
      break;
    }
    if (!missingColumn(error, ["bloom_level"])) throw new Error(error.message);
  }
  if (!created?.length) return 0;

  const { error: tagError } = await supabase
    .from("question_curriculum_tags")
    .insert(created.map((row) => ({ question_bank_item_id: row.id, group_id: groupId })));
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
