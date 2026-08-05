"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gradeAnswer } from "@/lib/grading";
import type {
  MasteryBand,
  Question,
  QuestionOptions,
  QuestionType,
} from "@/lib/types";

const CODE_COOKIE = "practice_code";
const CODE_MAX_AGE_DAYS = 180;

export interface PracticeLearner {
  learner_id: string;
  learner_name: string;
  is_tera_student: boolean;
}

export interface PracticeSubject {
  subject_id: string;
  subject_name: string;
  question_count: number;
}

/** A curriculum topic group in Tera, with how many bank questions carry its tag. */
export interface PracticeTopic {
  group_id: string;
  grade_level: string;
  semester: number;
  theme: string | null;
  topic: string;
  question_count: number;
}

/** A question as the learner sees it: no answer key, no explanation. */
export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOptions;
  weight: number;
  stimulus_images: string[];
}

export interface AnswerResult {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  explanation: string | null;
}

export interface TopicScore {
  group_id: string;
  topic: string;
  theme: string | null;
  answered: number;
  score: number;
  max_score: number;
}

interface AnswerKeyRow {
  type: QuestionType;
  options: QuestionOptions;
  correct_answer: unknown;
  weight: number;
  explanation: string | null;
}

/** The code lives in a cookie so a learner types it once, not every session. */
async function currentCode(): Promise<string> {
  return (await cookies()).get(CODE_COOKIE)?.value ?? "";
}

async function learnerFor(code: string): Promise<PracticeLearner | null> {
  if (!code) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_login", { p_access_code: code });
  return (data as PracticeLearner[] | null)?.[0] ?? null;
}

async function requireLearner(): Promise<PracticeLearner> {
  const learner = await learnerFor(await currentCode());
  // Only reachable if the cookie outlived the code being revoked.
  if (!learner) redirect("/practice?error=1");
  return learner;
}

/** Who the cookie belongs to, or null when there is no usable code. */
export async function signedInLearner(): Promise<PracticeLearner | null> {
  return learnerFor(await currentCode());
}

export async function signIn(formData: FormData) {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();

  if (!(await learnerFor(code))) redirect("/practice?error=1");

  (await cookies()).set(CODE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * CODE_MAX_AGE_DAYS,
    path: "/",
  });
  redirect("/practice");
}

export async function signOut() {
  (await cookies()).delete(CODE_COOKIE);
  redirect("/practice");
}

/** Only subjects that actually have tagged questions, so no menu is ever empty. */
export async function loadSubjects(): Promise<PracticeSubject[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_subjects", { p_access_code: await currentCode() });
  return (data as PracticeSubject[] | null) ?? [];
}

export async function loadTopics(subjectId: string): Promise<PracticeTopic[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_topics", {
    p_access_code: await currentCode(),
    p_subject_id: subjectId,
  });
  return (data as PracticeTopic[] | null) ?? [];
}

/** The rubric for a subject, falling back to the global default, or null for raw scores. */
export async function loadRubric(subjectId: string): Promise<MasteryBand[] | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mastery_rubric_for", { p_subject_id: subjectId });
  return (data as MasteryBand[] | null) ?? null;
}

/**
 * Opens a session and draws its questions. The draw happens in the database
 * (`practice_draw_questions`) because it needs the learner's whole answer
 * history to order the pool, and because that is where the answer key can be
 * left behind.
 */
export async function startSession(
  subjectId: string,
  groupIds: string[],
  count: number,
): Promise<{ sessionId: string; questions: PracticeQuestion[] } | { error: string }> {
  const learner = await requireLearner();
  const supabase = await createClient();

  const { data: drawn } = await supabase.rpc("practice_draw_questions", {
    p_access_code: await currentCode(),
    p_group_ids: groupIds,
    p_limit: count,
  });

  const questions = (drawn as PracticeQuestion[] | null) ?? [];
  if (questions.length === 0) {
    return { error: "Belum ada soal untuk topik itu. Coba topik lain." };
  }

  const { data: session, error } = await supabase
    .from("practice_sessions")
    .insert({
      learner_id: learner.learner_id,
      subject_id: subjectId,
      group_ids: groupIds,
      question_count: questions.length,
    })
    .select("id")
    .single();

  if (error || !session) {
    console.error("[practice] gagal membuat sesi:", error);
    return { error: `Gagal memulai sesi latihan: ${error?.message ?? "tidak diketahui"}` };
  }
  return { sessionId: session.id as string, questions };
}

/**
 * Grades one answer and records it. The key is fetched here, on the server, and
 * never reaches the browser before the learner has committed to an answer —
 * `gradeAnswer` is the same function the quiz side uses, so a question scores
 * identically whether it is met in a quiz or in practice.
 */
export async function submitAnswer(
  sessionId: string,
  questionId: string,
  response: unknown,
): Promise<AnswerResult> {
  const learner = await requireLearner();
  const supabase = await createClient();

  const { data: keyRows } = await supabase.rpc("practice_answer_key", {
    p_access_code: await currentCode(),
    p_item_id: questionId,
  });
  const key = (keyRows as AnswerKeyRow[] | null)?.[0];
  if (!key) return { isCorrect: false, score: 0, maxScore: 0, explanation: null };

  const graded = gradeAnswer(
    {
      id: questionId,
      quiz_id: "",
      type: key.type,
      prompt: "",
      options: key.options,
      correct_answer: key.correct_answer,
      weight: Number(key.weight) || 1,
      order_index: 0,
      branching: null,
      explanation: key.explanation,
      // Penilaian tidak pernah melihat stimulus; kuncinya ada di correct_answer.
      stimulus_images: [],
    } satisfies Question,
    response,
  );

  const maxScore = Number(key.weight) || 1;
  const score = graded.autoScore ?? 0;

  const { error: insertError } = await supabase.from("practice_answers").insert({
    session_id: sessionId,
    learner_id: learner.learner_id,
    question_bank_item_id: questionId,
    response: response as never,
    is_correct: score >= maxScore,
    score,
    max_score: maxScore,
  });
  if (insertError) console.error("[practice] gagal menyimpan jawaban:", insertError);

  return { isCorrect: score >= maxScore, score, maxScore, explanation: key.explanation };
}

export async function finishSession(sessionId: string): Promise<TopicScore[]> {
  const supabase = await createClient();

  await supabase
    .from("practice_sessions")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId);

  const { data, error } = await supabase.rpc("practice_summary", {
    p_access_code: await currentCode(),
    p_session_id: sessionId,
  });
  if (error) console.error("[practice] gagal menghitung ringkasan:", error);
  return (data as TopicScore[] | null) ?? [];
}
