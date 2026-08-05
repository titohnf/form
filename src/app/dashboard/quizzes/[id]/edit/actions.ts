"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateShareCode } from "@/lib/share-code";
import { isMissingBloomColumn } from "@/lib/bloom";
import type { QuestionPatch, QuestionType, QuizSettings } from "@/lib/types";

export async function updateQuizMeta(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim() || "Paket Soal Baru";
  const description = String(formData.get("description") ?? "").trim();

  await supabase.from("quizzes").update({ title, description }).eq("id", quizId);

  // Judul penugasan ikut diperbarui: `assessment_entry()` menyajikan
  // `assessments.title` ke murid, jadi kalau tidak disalin ulang, mengganti
  // judul di sini tidak terlihat sama sekali di halaman murid.
  await supabase.from("assessments").update({ title }).eq("quiz_id", quizId);

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

/**
 * Menugaskan satu paket soal ke satu sesi kelas — inilah "asesmen" dari sisi
 * Tera, dan satu-satunya jalur admin untuk itu.
 *
 * Penugasan, bukan kepemilikan (lihat migrasi 074): `quizzes.session_id`
 * sengaja dibiarkan null supaya paket soal induk buatan admin tidak bisa
 * disunting tutor, sementara satu paket boleh dipakai di banyak sesi. Share
 * code hidup di baris penugasan, bukan di paketnya, karena pintu masuk murid
 * adalah "paket ini di sesi itu" — itulah yang menentukan roster dan ke sesi
 * mana nilainya mengalir.
 */
export async function assignToSession(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  if (!sessionId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", quizId)
    .single();
  if (!quiz) return;

  // Tidak ada unique index (quiz_id, session_id) di DB — dua penugasan ke sesi
  // yang sama hanya akan memberi dua share code untuk hal yang sama.
  const { data: existing } = await supabase
    .from("assessments")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) {
    revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
    return;
  }

  // Share code-nya unik lintas penugasan, jadi tabrakan diulang beberapa kali —
  // pola yang sama dengan publishQuiz.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("assessments").insert({
      session_id: sessionId,
      created_by: user.id,
      quiz_id: quizId,
      title: quiz.title,
      description: "Dinilai otomatis dari Sora.",
      max_score: 100,
      share_code: generateShareCode(),
    });
    if (!error) break;
    if (error.code !== "23505") throw new Error(error.message);
  }

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

/**
 * Menarik satu penugasan. Menolak kalau sudah ada nilai di sesi itu:
 * `assessment_results` ikut terhapus lewat cascade, dan nilai yang sudah masuk
 * rapor Tera tidak boleh hilang gara-gara satu klik di sini.
 */
export async function unassignFromSession(quizId: string, assessmentId: string) {
  const supabase = await createClient();

  const { count } = await supabase
    .from("assessment_results")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (count && count > 0) return;

  await supabase.from("assessments").delete().eq("id", assessmentId).eq("quiz_id", quizId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function addQuestion(quizId: string, nextOrderIndex: number) {
  const supabase = await createClient();
  // Start blank: a placeholder prompt only has to be deleted again, and an
  // empty question is saved the moment the tutor types (see saveQuestion).
  await supabase.from("questions").insert({
    quiz_id: quizId,
    type: "mcq_single" as QuestionType,
    prompt: "",
    options: { choices: ["", ""] },
    correct_answer: "",
    weight: 1,
    order_index: nextOrderIndex,
  });
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

/**
 * Autosave target for the question editor. Takes an already-parsed patch
 * instead of FormData because the editor holds its fields in React state and
 * fires this on a debounce rather than on submit.
 *
 * Deliberately does NOT revalidate: the tutor is mid-edit and the client
 * already holds the newest values, so re-rendering the server component would
 * only risk yanking the field they are typing in.
 */
export async function saveQuestion(questionId: string, patch: QuestionPatch) {
  const supabase = await createClient();
  const { error } = await supabase.from("questions").update(patch).eq("id", questionId);

  if (isMissingBloomColumn(error)) {
    const { bloom_level, ...rest } = patch;
    void bloom_level;
    await supabase.from("questions").update(rest).eq("id", questionId);
  }
}

export async function deleteQuestion(quizId: string, questionId: string) {
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", questionId);
  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

/** Persists a drag-and-drop reorder as one order_index per question. */
export async function reorderQuestions(quizId: string, orderedIds: string[]) {
  const supabase = await createClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("questions").update({ order_index: index }).eq("id", id).eq("quiz_id", quizId),
    ),
  );

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

export async function saveToBank(questionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const columns = "type, prompt, options, correct_answer, weight, explanation, stimulus_images";

  // Level Bloom ikut menyeberang: ia melekat pada soalnya, bukan pada paket
  // tempat soal itu kebetulan dipakai.
  const read = await supabase
    .from("questions")
    .select(`${columns}, bloom_level`)
    .eq("id", questionId)
    .single();

  const question: Record<string, unknown> | null = isMissingBloomColumn(read.error)
    ? (await supabase.from("questions").select(columns).eq("id", questionId).single()).data
    : read.data;
  if (!question) return;

  const { error: insertError } = await supabase
    .from("question_bank_items")
    .insert({ created_by: user.id, ...question });

  if (isMissingBloomColumn(insertError)) {
    const { bloom_level: _dropped, ...rest } = question;
    void _dropped;
    await supabase.from("question_bank_items").insert({ created_by: user.id, ...rest });
  }
}

/**
 * Menyalin beberapa soal bank ke paket sekaligus.
 *
 * Sekaligus, bukan satu per satu, karena meracik try out dari 30 soal lewat
 * satu-klik-satu-soal berarti 30 kali muat ulang halaman — dan tidak ada
 * penanda mana yang sudah masuk, jadi mudah dobel atau terlewat.
 *
 * Urutan `bankItemIds` dipertahankan sebagai urutan soal di paket: itu urutan
 * yang dilihat admin saat mencentang, dan mengacaknya di sini hanya bikin dia
 * menata ulang dengan tangan.
 *
 * Isinya DISALIN, bukan ditautkan — mengedit soal di paket tidak mengubah
 * aslinya di bank. `bank_item_id` cuma penanda asal, dipakai untuk
 * menyembunyikan tombol "Simpan ke Bank" pada soal yang justru datang dari
 * sana.
 */
export async function addManyFromBank(
  quizId: string,
  nextOrderIndex: number,
  bankItemIds: string[],
) {
  if (bankItemIds.length === 0) return;
  const supabase = await createClient();

  const columns =
    "id, type, prompt, options, correct_answer, weight, explanation, stimulus_images";

  const read = await supabase
    .from("question_bank_items")
    .select(`${columns}, bloom_level`)
    .in("id", bankItemIds);

  const items: Record<string, unknown>[] | null = isMissingBloomColumn(read.error)
    ? (await supabase.from("question_bank_items").select(columns).in("id", bankItemIds)).data
    : read.data;
  if (!items?.length) return;

  const byId = new Map(items.map((i) => [i.id as string, i]));
  const rows = bankItemIds
    .map((id) => byId.get(id))
    .filter((i) => i !== undefined)
    .map((item, index) => {
      const { id, ...content } = item;
      return { quiz_id: quizId, order_index: nextOrderIndex + index, bank_item_id: id, ...content };
    });

  const { error } = await supabase.from("questions").insert(rows);

  // Sebelum migrasi 082 kolom `bank_item_id` belum ada, dan `bloom_level` juga
  // menyusul belakangan. Soalnya tetap masuk — yang hilang hanya penanda asal
  // atau labelnya. Lebih baik daripada menolak menambahkan soal.
  const missingColumn =
    error?.code === "PGRST204"
      ? ["bank_item_id", "bloom_level"].find((column) => (error.message ?? "").includes(column))
      : undefined;

  if (missingColumn) {
    await supabase.from("questions").insert(
      rows.map((row) => {
        const trimmed: Record<string, unknown> = { ...row };
        delete trimmed[missingColumn];
        return trimmed;
      }),
    );
  } else if (error) {
    throw new Error(error.message);
  }

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
