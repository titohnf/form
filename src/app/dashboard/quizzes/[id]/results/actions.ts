"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { missingColumn, without } from "@/lib/missing-column";
import { perQuestionAccuracy, weakQuestions } from "@/lib/question-stats";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";

const BASE_COLUMNS =
  "id, type, prompt, options, correct_answer, weight, order_index, explanation, stimulus_images, bank_item_id";

/** Kolom yang menyusul lewat migrasi; boleh belum ada saat kode ini berjalan. */
const OPTIONAL_COLUMNS = ["bloom_level"];

/**
 * Merakit paket Remedial dari soal yang paling banyak dijawab salah.
 *
 * Remedial adalah soal yang murid masih salah menjawabnya, jadi menyusunnya
 * dengan tangan berarti tutor membaca analitik lalu menyalin ulang soal satu
 * per satu — pekerjaan yang datanya sudah dimiliki sistem.
 *
 * Ambangnya datang dari tutor. Sora tidak punya KKM, dan berapa yang dianggap
 * "belum dikuasai" berbeda antar mapel; menetapkannya di kode berarti memutuskan
 * sesuatu yang bukan urusan kode.
 *
 * Soalnya disalin apa adanya, dengan urutan soal dan pilihan diacak.
 * Mengulangi soal yang sama utuh jauh lebih berguna daripada tidak
 * diremedialkan sama sekali.
 */
export async function createRemedialFromQuiz(quizId: string, formData: FormData) {
  const threshold = Number(formData.get("threshold") ?? 70);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, session_id, class_id")
    .eq("id", quizId)
    .single();
  if (!quiz) return;

  const readQuestions = (columns: string) =>
    supabase.from("questions").select(columns).eq("quiz_id", quizId).order("order_index");

  const [firstRead, { data: answerRows }, { data: attemptRows }] = await Promise.all([
    readQuestions(`${BASE_COLUMNS}, ${OPTIONAL_COLUMNS.join(", ")}`),
    supabase.from("answers").select("*").eq("quiz_id", quizId),
    supabase.from("attempts").select("*").eq("quiz_id", quizId),
  ]);

  const questionRows = missingColumn(firstRead.error, OPTIONAL_COLUMNS)
    ? (await readQuestions(BASE_COLUMNS)).data
    : firstRead.data;

  const questions = (questionRows ?? []) as unknown as Question[];
  const stats = perQuestionAccuracy(
    questions,
    (answerRows ?? []) as Answer[],
    (attemptRows ?? []) as Attempt[],
  );
  const weak = weakQuestions(stats, threshold);
  if (weak.length === 0) return;

  const source = quiz as Pick<Quiz, "id" | "title"> & {
    session_id: string | null;
    class_id: string | null;
  };

  const { data: created, error } = await supabase
    .from("quizzes")
    .insert({
      created_by: user.id,
      title: `Remedial — ${source.title}`,
      status: "draft",
      kind: "remedial",
      // Menempel ke sesi dan kelas yang sama: remedial menyusul asesmen yang
      // sama, dan tanpa `class_id` rosternya kosong sehingga murid jatuh ke
      // mode tamu.
      session_id: source.session_id,
      class_id: source.class_id,
      // Diacak karena soalnya memang soal yang sama: inilah satu-satunya yang
      // menghalangi murid menghafal urutan jawaban alih-alih memahami soalnya.
      settings: { shuffle_questions: true, shuffle_choices: true },
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Gagal membuat paket remedial");

  const rows = weak.map(({ question }, index) => ({
    quiz_id: created.id,
    order_index: index,
    type: question.type,
    weight: question.weight,
    explanation: question.explanation,
    stimulus_images: question.stimulus_images ?? [],
    bank_item_id: question.bank_item_id ?? null,
    bloom_level: question.bloom_level ?? null,
    prompt: question.prompt,
    options: question.options,
    correct_answer: question.correct_answer,
  }));

  // Sama seperti pembacaannya: kolom yang belum ada dibuang lalu ditulis ulang,
  // supaya remedial tetap jadi meski migrasinya belum jalan. Buangannya
  // menumpuk — kalau dua-duanya belum ada, Postgres baru menyebut yang kedua
  // setelah yang pertama hilang.
  const dropped: string[] = [];
  let insertError = null;
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt += 1) {
    ({ error: insertError } = await supabase
      .from("questions")
      .insert(rows.map((row) => without(row, dropped))));

    const missing = missingColumn(insertError, OPTIONAL_COLUMNS);
    if (!missing) break;
    dropped.push(missing);
  }
  if (insertError) throw new Error(insertError.message);

  redirect(`/dashboard/quizzes/${created.id}/edit`);
}
