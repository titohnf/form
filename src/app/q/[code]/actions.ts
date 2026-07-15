"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gradeAnswer, totalScore } from "@/lib/grading";
import type { Question, QuizSettings } from "@/lib/types";

export type StartAttemptResult = { attemptId: string } | { error: string };

export async function startAttempt(
  shareCode: string,
  guestName: string,
  studentId: string | null,
): Promise<StartAttemptResult> {
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status, settings")
    .eq("share_code", shareCode)
    .single();

  if (!quiz || quiz.status !== "published") {
    return { error: "Kuis tidak tersedia." };
  }

  const settings = (quiz.settings ?? {}) as Partial<QuizSettings>;
  const now = new Date();

  if (settings.opens_at && now < new Date(settings.opens_at)) {
    return { error: "Kuis belum dibuka." };
  }
  if (settings.closes_at && now > new Date(settings.closes_at)) {
    return { error: "Kuis sudah ditutup." };
  }

  if (settings.max_attempts) {
    const { count } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quiz.id)
      .eq("guest_name", guestName);
    if ((count ?? 0) >= settings.max_attempts) {
      return { error: "Kamu sudah mencapai batas percobaan untuk kuis ini." };
    }
  }

  const { data: attempt, error } = await supabase
    .from("attempts")
    .insert({ quiz_id: quiz.id, guest_name: guestName, student_id: studentId })
    .select("id")
    .single();

  if (error || !attempt) {
    return { error: "Gagal memulai kuis." };
  }

  return { attemptId: attempt.id };
}

export async function saveAnswer(
  quizId: string,
  attemptId: string,
  questionId: string,
  response: unknown,
  questionIndex: number,
) {
  const supabase = await createClient();

  await supabase
    .from("answers")
    .upsert(
      { attempt_id: attemptId, question_id: questionId, quiz_id: quizId, response },
      { onConflict: "attempt_id,question_id" },
    );

  await supabase
    .from("attempts")
    .update({ current_question_index: questionIndex, last_active_at: new Date().toISOString() })
    .eq("id", attemptId);
}

export async function finalizeAttempt(shareCode: string, attemptId: string) {
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, quiz_id")
    .eq("id", attemptId)
    .single();

  if (!attempt) {
    redirect(`/q/${shareCode}?error=Percobaan+tidak+ditemukan`);
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", attempt!.quiz_id);

  const { data: existingAnswers } = await supabase
    .from("answers")
    .select("*")
    .eq("attempt_id", attemptId);

  const gradedAnswers = (questions as Question[] | null ?? []).map((question) => {
    const existing = (existingAnswers ?? []).find((a) => a.question_id === question.id);
    const { autoScore, needsManualGrading } = gradeAnswer(question, existing?.response ?? null);
    return {
      attempt_id: attemptId,
      question_id: question.id,
      quiz_id: attempt!.quiz_id,
      response: existing?.response ?? null,
      auto_score: autoScore,
      manual_score: null,
      needs_manual_grading: needsManualGrading,
    };
  });

  if (gradedAnswers.length > 0) {
    await supabase
      .from("answers")
      .upsert(gradedAnswers, { onConflict: "attempt_id,question_id" });
  }

  const score = totalScore(gradedAnswers);
  await supabase
    .from("attempts")
    .update({ total_score: score, submitted_at: new Date().toISOString() })
    .eq("id", attemptId);

  redirect(`/q/${shareCode}/result/${attemptId}`);
}
