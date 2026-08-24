"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { missingColumn, without } from "@/lib/missing-column";
import type { QuestionPatch } from "@/lib/types";

/** Kolom yang menyusul lewat migrasi; boleh belum ada saat kode ini berjalan. */
const OPTIONAL_COLUMNS = ["bloom_level", "template"];

/**
 * Autosave target for a bank item, mirroring `saveQuestion` for quiz questions.
 * `branching` is dropped: it points at sibling questions inside one quiz, which
 * a reusable bank item has none of.
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
    if (!missing) return;
    dropped.push(missing);
  }
}

/**
 * Membuat satu soal kosong di dalam satu topik. Topiknya wajib: soal tanpa topik
 * tidak pernah muncul di latihan mandiri murid, jadi menanyakannya belakangan
 * hanya menumpuk soal yang tak terpakai. Penandaan many-to-many-nya tetap bisa
 * ditambah dari kartunya nanti — yang diminta di sini cuma kamar pertamanya.
 *
 * `group` datang dari FormData supaya satu action ini melayani dua pemanggil:
 * tombol di dalam tiap topik (topik tersirat dari tempat mengklik) dan dialog
 * di header (untuk topik yang belum punya soal sama sekali, yang karena itu
 * tidak dirender di daftar).
 */
export async function createBankItem(formData: FormData) {
  const groupId = String(formData.get("group") ?? "").trim();
  if (!groupId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Blank, like a new quiz question: a placeholder only has to be deleted again.
  const { data: created } = await supabase
    .from("question_bank_items")
    .insert({
      created_by: user.id,
      type: "mcq_single",
      prompt: "",
      options: { choices: ["", ""] },
      correct_answer: "",
      weight: 1,
    })
    .select("id")
    .single();
  if (!created) return;

  await supabase
    .from("question_curriculum_tags")
    .insert({ question_bank_item_id: created.id, group_id: groupId });

  revalidatePath("/dashboard/bank");
  // Disaring ke topiknya supaya bagian itu terbuka — anchor tidak bisa menggulir
  // ke dalam <details> yang tertutup — dan supaya soal barunya jadi satu-satunya
  // hal di layar, bukan kartu ke sekian di kaki halaman.
  redirect(`/dashboard/bank?topic=${groupId}#soal-${created.id}`);
}

/**
 * Membuka atau menutup satu soal untuk pelanggan langganan Tera.
 *
 * Sakelarnya di sini, bukan di admin Tera, karena inilah tempat soalnya
 * disusun: keputusan "boleh keluar dari lingkungan bimbel atau tidak" diambil
 * sambil membaca soalnya, bukan dari daftar judul di aplikasi lain.
 *
 * Per SOAL, bukan per topik. Penandaan soal ke topik bersifat many-to-many,
 * jadi penanda di tingkat topik akan membuat soal privat yang kebetulan
 * di-tag ke topik terbuka ikut terbuka tanpa ada yang memutuskan — gagal
 * terbuka. Per soal gagal tertutup.
 *
 * Kalau kolomnya belum ada (migrasi 110 di repo Tera belum dijalankan),
 * fungsinya diam saja alih-alih melempar galat: yang gagal cuma fitur ini,
 * bukan penyuntingan soal yang sedang dikerjakan orangnya. Pola yang sama
 * dipakai `saveBankItem` untuk `bloom_level` dan `template`.
 */
export async function setBankItemPublic(itemId: string, isPublic: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("question_bank_items")
    .update({ is_public: isPublic })
    .eq("id", itemId);

  if (error && !missingColumn(error, ["is_public"])) throw error;
  revalidatePath("/dashboard/bank");
}

/**
 * Membuka atau menutup seluruh soal dalam satu topik sekaligus.
 *
 * Menandai satu per satu dari ratusan soal tidak akan pernah dikerjakan siapa
 * pun, jadi keputusan awalnya hampir selalu diambil per topik. Yang DISIMPAN
 * tetap per soal — soal baru yang ditandai ke topik yang sudah dibuka tidak
 * ikut terbuka sendiri, dan itu memang yang diinginkan.
 *
 * Satu soal bisa bertanda beberapa topik, jadi menutup topik A ikut menutup
 * soal yang juga milik topik B. Karena itu kepala tiap topik menampilkan
 * hitungan terbukanya: akibat di tempat lain harus terlihat, bukan mengejutkan.
 */
export async function setTopicPublic(groupId: string, isPublic: boolean) {
  const supabase = await createClient();

  const { data: tags } = await supabase
    .from("question_curriculum_tags")
    .select("question_bank_item_id")
    .eq("group_id", groupId);

  const ids = (tags ?? []).map((t) => t.question_bank_item_id as string);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("question_bank_items")
    .update({ is_public: isPublic })
    .in("id", ids);

  if (error && !missingColumn(error, ["is_public"])) throw error;
  revalidatePath("/dashboard/bank");
}

export async function deleteBankItem(itemId: string) {
  const supabase = await createClient();
  await supabase.from("question_bank_items").delete().eq("id", itemId);
  revalidatePath("/dashboard/bank");
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
  revalidatePath("/dashboard/bank");
}
