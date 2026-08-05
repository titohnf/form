"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingBloomColumn } from "@/lib/bloom";
import type { QuestionPatch } from "@/lib/types";

/**
 * Autosave target for a bank item, mirroring `saveQuestion` for quiz questions.
 * `branching` is dropped: it points at sibling questions inside one quiz, which
 * a reusable bank item has none of.
 */
export async function saveBankItem(itemId: string, patch: QuestionPatch) {
  const supabase = await createClient();
  const { type, prompt, weight, options, correct_answer, explanation, stimulus_images } = patch;
  const content = { type, prompt, weight, options, correct_answer, explanation, stimulus_images };

  const { error } = await supabase
    .from("question_bank_items")
    .update({ ...content, bloom_level: patch.bloom_level })
    .eq("id", itemId);

  if (isMissingBloomColumn(error)) {
    await supabase.from("question_bank_items").update(content).eq("id", itemId);
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
