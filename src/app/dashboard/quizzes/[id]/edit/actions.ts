"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { QuestionType } from "@/lib/types";

export async function updateQuizMeta(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim() || "Kuis Baru";
  const description = String(formData.get("description") ?? "").trim();

  await supabase.from("quizzes").update({ title, description }).eq("id", quizId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function addQuestion(quizId: string, nextOrderIndex: number) {
  const supabase = await createClient();
  await supabase.from("questions").insert({
    quiz_id: quizId,
    type: "mcq_single" as QuestionType,
    prompt: "Pertanyaan baru",
    options: { choices: ["Pilihan A", "Pilihan B"] },
    correct_answer: "Pilihan A",
    weight: 1,
    order_index: nextOrderIndex,
  });
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function updateQuestion(quizId: string, questionId: string, formData: FormData) {
  const supabase = await createClient();
  const type = String(formData.get("type")) as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const weight = Number(formData.get("weight")) || 1;

  let options: { choices: string[] } | null = null;
  let correctAnswer: unknown = null;

  if (type === "mcq_single") {
    const choices = String(formData.get("choices") ?? "")
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    options = { choices };
    correctAnswer = String(formData.get("mcq_correct") ?? "");
  } else if (type === "true_false") {
    correctAnswer = String(formData.get("tf_correct") ?? "true");
  } else if (type === "short_answer") {
    correctAnswer = String(formData.get("short_answer_keys") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  // essay: no correct_answer

  await supabase
    .from("questions")
    .update({ type, prompt, weight, options, correct_answer: correctAnswer })
    .eq("id", questionId);

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function deleteQuestion(quizId: string, questionId: string) {
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", questionId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function moveQuestion(
  quizId: string,
  questionId: string,
  direction: "up" | "down",
) {
  const supabase = await createClient();
  const { data: questions } = await supabase
    .from("questions")
    .select("id, order_index")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (!questions) return;

  const index = questions.findIndex((q) => q.id === questionId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= questions.length) return;

  const a = questions[index];
  const b = questions[swapWith];

  await supabase.from("questions").update({ order_index: b.order_index }).eq("id", a.id);
  await supabase.from("questions").update({ order_index: a.order_index }).eq("id", b.id);

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}
