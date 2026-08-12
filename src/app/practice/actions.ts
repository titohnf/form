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
const CHILD_COOKIE = "practice_child";
const CODE_MAX_AGE_DAYS = 180;

export interface PracticeLearner {
  learner_id: string;
  learner_name: string;
  is_tera_student: boolean;
}

/** Seorang anak dari keluarga yang sedang masuk. */
export interface PracticeChild {
  student_id: string;
  student_name: string;
  /** null kalau anak ini belum pernah punya identitas latihan. */
  learner_id: string | null;
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

/**
 * Dua pintu masuk, satu identitas.
 *
 * Latihan mandiri bisa dimasuki lewat KODE (anak berlatih di perangkat tutor
 * saat les; login akun keluarga di perangkat orang lain akan membuka tagihan
 * dan laporan keluarga itu, kode hanya membuka latihan) atau lewat AKUN
 * KELUARGA (anak berlatih di rumah, tanpa menunggu admin menerbitkan apa pun).
 * Murid luar Tera selalu lewat kode.
 *
 * Keduanya berakhir di argumen yang sama untuk tiap RPC. Perhatikan bahwa yang
 * dikirim dari sini hanyalah KLAIM: id anak diambil dari cookie yang bisa saja
 * dikarang. Yang memutuskan tetap `practice_actor()` di database, yang mencocokkan
 * kode atau memastikan `auth.uid()` memang keluarga anak itu — jadi cookie palsu
 * tidak menghasilkan apa pun selain daftar kosong.
 */
async function identity(): Promise<{ p_access_code: string; p_learner_id: string | null }> {
  const jar = await cookies();
  return {
    p_access_code: jar.get(CODE_COOKIE)?.value ?? "",
    p_learner_id: jar.get(CHILD_COOKIE)?.value ?? null,
  };
}

async function learnerFor(args: {
  p_access_code: string;
  p_learner_id: string | null;
}): Promise<PracticeLearner | null> {
  if (!args.p_access_code && !args.p_learner_id) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_login", args);
  return (data as PracticeLearner[] | null)?.[0] ?? null;
}

async function requireLearner(): Promise<PracticeLearner> {
  const learner = await learnerFor(await identity());
  // Only reachable if the cookie outlived the code being revoked, or the family
  // session ended while the child cookie stayed behind.
  if (!learner) redirect("/practice?error=1");
  return learner;
}

/** Who the cookies belong to, or null when neither door is open. */
export async function signedInLearner(): Promise<PracticeLearner | null> {
  return learnerFor(await identity());
}

/**
 * Anak-anak keluarga yang sedang masuk, untuk layar pemilihan.
 *
 * Tidak perlu memeriksa peran di sini: `practice_children()` hanya mengembalikan
 * anak milik `auth.uid()`, jadi siapa pun selain keluarga mendapat daftar kosong.
 */
export async function loadChildren(): Promise<PracticeChild[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_children");
  return (data as PracticeChild[] | null) ?? [];
}

/**
 * Memilih anak yang akan berlatih. Identitas latihannya dibuatkan kalau anak itu
 * belum pernah punya — inilah yang membuat jalur keluarga tidak lagi menunggu
 * admin menerbitkan kode lebih dulu.
 */
export async function chooseChild(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/practice");

  const supabase = await createClient();
  const { data: learnerId, error } = await supabase.rpc("practice_start_as_child", {
    p_student: studentId,
  });

  if (error || !learnerId) {
    console.error("[practice] gagal menyiapkan identitas latihan:", error);
    redirect("/practice?error=child");
  }

  (await cookies()).set(CHILD_COOKIE, learnerId as string, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * CODE_MAX_AGE_DAYS,
    path: "/",
  });
  redirect("/practice");
}

/** Kembali ke layar pemilihan anak tanpa keluar dari akun keluarga. */
export async function switchChild() {
  (await cookies()).delete(CHILD_COOKIE);
  redirect("/practice");
}

export async function signIn(formData: FormData) {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();

  if (!(await learnerFor({ p_access_code: code, p_learner_id: null }))) {
    redirect("/practice?error=1");
  }

  (await cookies()).set(CODE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * CODE_MAX_AGE_DAYS,
    path: "/",
  });
  redirect("/practice");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(CODE_COOKIE);
  jar.delete(CHILD_COOKIE);
  redirect("/practice");
}

/** Only subjects that actually have tagged questions, so no menu is ever empty. */
export async function loadSubjects(): Promise<PracticeSubject[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_subjects", await identity());
  return (data as PracticeSubject[] | null) ?? [];
}

export async function loadTopics(subjectId: string): Promise<PracticeTopic[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("practice_topics", {
    ...(await identity()),
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
    ...(await identity()),
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
    ...(await identity()),
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
    ...(await identity()),
    p_session_id: sessionId,
  });
  if (error) console.error("[practice] gagal menghitung ringkasan:", error);
  return (data as TopicScore[] | null) ?? [];
}
