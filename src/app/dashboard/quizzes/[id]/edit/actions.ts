"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Branching, QuestionType, QuestionOptions, QuizSettings } from "@/lib/types";

export async function updateQuizMeta(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim() || "Kuis Baru";
  const description = String(formData.get("description") ?? "").trim();

  await supabase.from("quizzes").update({ title, description }).eq("id", quizId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function updateQuizSettings(quizId: string, formData: FormData) {
  const supabase = await createClient();

  const timeLimit = String(formData.get("time_limit_minutes") ?? "").trim();
  const maxAttempts = String(formData.get("max_attempts") ?? "").trim();
  const opensAt = String(formData.get("opens_at") ?? "").trim();
  const closesAt = String(formData.get("closes_at") ?? "").trim();

  const settings: QuizSettings = {
    time_limit_minutes: timeLimit ? Number(timeLimit) : null,
    shuffle_questions: formData.get("shuffle_questions") === "on",
    shuffle_choices: formData.get("shuffle_choices") === "on",
    show_score_immediately: formData.get("show_score_immediately") === "on",
    max_attempts: maxAttempts ? Number(maxAttempts) : null,
    opens_at: opensAt ? new Date(opensAt).toISOString() : null,
    closes_at: closesAt ? new Date(closesAt).toISOString() : null,
    sequential_mode: formData.get("sequential_mode") === "on",
  };

  await supabase.from("quizzes").update({ settings }).eq("id", quizId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function assignClass(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const classId = String(formData.get("class_id") ?? "").trim();
  await supabase
    .from("quizzes")
    .update({ class_id: classId || null })
    .eq("id", quizId);
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

function parseQuestionFields(formData: FormData): {
  type: QuestionType;
  prompt: string;
  weight: number;
  options: QuestionOptions;
  correctAnswer: unknown;
  branching: Branching | null;
} {
  const type = String(formData.get("type")) as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const weight = Number(formData.get("weight")) || 1;

  const branchingRaw = String(formData.get("branching_json") ?? "");
  let branching: Branching | null = null;
  if (branchingRaw) {
    try {
      const parsed = JSON.parse(branchingRaw) as Branching;
      branching = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v));
      if (Object.keys(branching).length === 0) branching = null;
    } catch {
      branching = null;
    }
  }

  let options: QuestionOptions = null;
  let correctAnswer: unknown = null;

  if (type === "mcq_single" || type === "mcq_multi") {
    const choices = String(formData.get("choices") ?? "")
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    options = { choices };
    correctAnswer =
      type === "mcq_single"
        ? String(formData.get("mcq_correct") ?? "")
        : String(formData.get("mcq_multi_correct") ?? "")
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean);
  } else if (type === "true_false") {
    correctAnswer = String(formData.get("tf_correct") ?? "true");
  } else if (type === "short_answer") {
    correctAnswer = String(formData.get("short_answer_keys") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  } else if (type === "matching") {
    const pairs = String(formData.get("matching_pairs") ?? "")
      .split("\n")
      .map((line) => line.split("="))
      .filter((parts) => parts.length === 2)
      .map(([left, right]) => ({ left: left.trim(), right: right.trim() }))
      .filter((p) => p.left && p.right);
    options = { pairs };
  } else if (type === "ordering") {
    const items = String(formData.get("ordering_items") ?? "")
      .split("\n")
      .map((i) => i.trim())
      .filter(Boolean);
    options = { items };
  } else if (type === "fill_blank") {
    correctAnswer = String(formData.get("fill_blank_answers") ?? "")
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  // essay / upload_file: no options or correct_answer

  return { type, prompt, weight, options, correctAnswer, branching };
}

export async function updateQuestion(quizId: string, questionId: string, formData: FormData) {
  const supabase = await createClient();
  const { type, prompt, weight, options, correctAnswer, branching } = parseQuestionFields(formData);

  await supabase
    .from("questions")
    .update({ type, prompt, weight, options, correct_answer: correctAnswer, branching })
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

export async function saveToBank(questionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: question } = await supabase
    .from("questions")
    .select("type, prompt, options, correct_answer, weight")
    .eq("id", questionId)
    .single();
  if (!question) return;

  await supabase.from("question_bank_items").insert({ tutor_id: user.id, ...question });
}

export async function addFromBank(quizId: string, nextOrderIndex: number, bankItemId: string) {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("question_bank_items")
    .select("type, prompt, options, correct_answer, weight")
    .eq("id", bankItemId)
    .single();
  if (!item) return;

  await supabase.from("questions").insert({
    quiz_id: quizId,
    order_index: nextOrderIndex,
    ...item,
  });

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export interface GeneratedQuestionInput {
  prompt: string;
  choices: string[];
  correct_answer: string;
  weight: number;
}

export async function addGeneratedQuestions(
  quizId: string,
  nextOrderIndex: number,
  questions: GeneratedQuestionInput[],
) {
  const supabase = await createClient();
  const rows = questions.map((q, i) => ({
    quiz_id: quizId,
    type: "mcq_single" as QuestionType,
    prompt: q.prompt,
    options: { choices: q.choices },
    correct_answer: q.correct_answer,
    weight: q.weight || 1,
    order_index: nextOrderIndex + i,
  }));

  if (rows.length > 0) {
    await supabase.from("questions").insert(rows);
  }

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}
