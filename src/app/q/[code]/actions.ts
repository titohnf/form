"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { totalScore } from "@/lib/grading";
import type { Question, QuizSettings } from "@/lib/types";

export type StartAttemptResult = { attemptId: string } | { error: string };

export async function startAttempt(
  shareCode: string,
  guestName: string,
  learnerId: string | null,
): Promise<StartAttemptResult> {
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status, settings")
    .eq("share_code", shareCode)
    .single();

  if (!quiz || quiz.status !== "published") {
    return { error: "Paket soal tidak tersedia." };
  }

  const settings = (quiz.settings ?? {}) as Partial<QuizSettings>;
  const now = new Date();

  if (settings.opens_at && now < new Date(settings.opens_at)) {
    return { error: "Paket soal belum dibuka." };
  }
  if (settings.closes_at && now > new Date(settings.closes_at)) {
    return { error: "Paket soal sudah ditutup." };
  }

  if (settings.max_attempts) {
    const { count } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quiz.id)
      .eq("guest_name", guestName);
    if ((count ?? 0) >= settings.max_attempts) {
      return { error: "Kamu sudah mencapai batas percobaan untuk paket soal ini." };
    }
  }

  const { data: attempt, error } = await supabase
    .from("attempts")
    .insert({ quiz_id: quiz.id, guest_name: guestName, learner_id: learnerId })
    .select("id")
    .single();

  if (error || !attempt) {
    return { error: "Gagal memulai paket soal." };
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

  const daftar = (questions as Question[] | null ?? []).map((question) => ({
    question,
    response: (existingAnswers ?? []).find((a) => a.question_id === question.id)?.response ?? null,
  }));

  // Penilaiannya terjadi di database, lewat `nilai_jawaban()` (migrasi tera
  // 136) — satu-satunya definisi aturan skoring, dipakai bersama oleh Sora dan
  // Tera. Sampai sebelum ini aturan yang sama ditulis dua kali di dua repo yang
  // tidak berbagi paket npm, dan yang menjaganya tetap sama cuma komentar.
  //
  // Sekali panggil untuk seluruh isi percobaan, bukan sekali per soal: kuis dua
  // puluh soal berarti dua puluh perjalanan ke Singapura di jalur yang tadinya
  // nol. Keluarannya sejajar indeks dengan masukannya.
  const { data: nilaiList, error: galatNilai } = await supabase.rpc("nilai_jawaban_banyak", {
    p_daftar: daftar.map(({ question, response }) => ({
      tipe: question.type,
      opsi: question.options,
      kunci: question.correct_answer,
      jawaban: response,
      bobot: question.weight,
    })),
  });

  if (galatNilai) {
    redirect(`/q/${shareCode}?error=Gagal+menilai+jawaban`);
  }

  const nilai = (nilaiList as (number | string | null)[] | null) ?? [];

  const gradedAnswers = daftar.map(({ question, response }, i) => {
    // `null` berarti tipe yang tidak dinilai mesin (esai, unggah berkas) —
    // bukan nol. Membedakannya di sini yang membuat soal esai masuk antrean
    // penilaian tutor alih-alih terbaca sebagai jawaban salah.
    const skor = nilai[i] === null || nilai[i] === undefined ? null : Number(nilai[i]);
    return {
      attempt_id: attemptId,
      question_id: question.id,
      quiz_id: attempt!.quiz_id,
      response,
      auto_score: skor,
      manual_score: null,
      needs_manual_grading: skor === null,
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

/**
 * Mulai (atau lanjutkan) attempt asesmen untuk murid yang sedang login.
 *
 * Seluruh pemeriksaan ada di `start_assessment_attempt` (migrasi 075): kode
 * dikenal, paket soalnya terbit, dan pemanggilnya terdaftar di kelas sesi itu.
 * Sengaja tidak di-insert dari sini — kalau attempt boleh ditulis langsung,
 * murid yang login masih bisa mengirimkan `learner_id` milik temannya.
 */
export async function startAssessmentAttempt(shareCode: string): Promise<StartAttemptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_assessment_attempt", {
    p_share_code: shareCode,
  });

  if (error) return { error: error.message };
  if (!data) return { error: "Tidak bisa memulai asesmen." };
  return { attemptId: data as string };
}
