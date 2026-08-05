"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { QuestionPatch } from "@/lib/types";

/**
 * Autosave target for a bank item, mirroring `saveQuestion` for quiz questions.
 * `branching` is dropped: it points at sibling questions inside one quiz, which
 * a reusable bank item has none of.
 */
export async function saveBankItem(itemId: string, patch: QuestionPatch) {
  const supabase = await createClient();
  const { type, prompt, weight, options, correct_answer, explanation, stimulus_images } = patch;
  await supabase
    .from("question_bank_items")
    .update({ type, prompt, weight, options, correct_answer, explanation, stimulus_images })
    .eq("id", itemId);
}

export async function createBankItem() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Blank, like a new quiz question: a placeholder only has to be deleted again.
  await supabase.from("question_bank_items").insert({
    created_by: user.id,
    type: "mcq_single",
    prompt: "",
    options: { choices: ["", ""] },
    correct_answer: "",
    weight: 1,
  });
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
