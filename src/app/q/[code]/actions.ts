"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gradeAnswer, totalScore } from "@/lib/grading";
import type { Question } from "@/lib/types";

export async function submitAttempt(shareCode: string, formData: FormData) {
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status")
    .eq("share_code", shareCode)
    .single();

  if (!quiz || quiz.status !== "published") {
    redirect(`/q/${shareCode}?error=Kuis+tidak+tersedia`);
  }

  const guestName = String(formData.get("guest_name") ?? "").trim();
  if (!guestName) {
    redirect(`/q/${shareCode}?error=Nama+wajib+diisi`);
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quiz.id)
    .order("order_index", { ascending: true });

  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .insert({ quiz_id: quiz.id, guest_name: guestName, submitted_at: new Date().toISOString() })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    redirect(`/q/${shareCode}?error=Gagal+mengirim+jawaban`);
  }

  const gradedAnswers = (questions as Question[] | null ?? []).map((question) => {
    const response = formData.get(`q_${question.id}`);
    const { autoScore, needsManualGrading } = gradeAnswer(question, response);
    return {
      attempt_id: attempt!.id,
      question_id: question.id,
      response,
      auto_score: autoScore,
      manual_score: null,
      needs_manual_grading: needsManualGrading,
    };
  });

  if (gradedAnswers.length > 0) {
    await supabase.from("answers").insert(gradedAnswers);
  }

  const score = totalScore(gradedAnswers);
  await supabase.from("attempts").update({ total_score: score }).eq("id", attempt!.id);

  redirect(`/q/${shareCode}/result/${attempt!.id}`);
}
