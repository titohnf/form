"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateShareCode } from "@/lib/share-code";
import { findQuizIssues } from "@/lib/question-validation";
import { BRANCH_END, QUIZ_KIND_LABEL, type Question, type QuizKind } from "@/lib/types";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createQuiz(formData?: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Paket soal tutor harus menempel ke sesinya: policy di migrasi 071 memberi tutor
  // hak hanya lewat `session_id`. Admin boleh membuat paket soal lepas.
  const sessionId = (formData?.get("session_id") as string) || null;

  // Kelasnya diturunkan dari sesi, bukan dibiarkan kosong. `quiz_roster()`
  // mencari murid lewat `quizzes.class_id`; tanpa itu rosternya kosong, murid
  // jatuh ke mode tamu, dan attempt tamu justru ditolak untuk paket soal bersesi.
  let classId: string | null = null;
  if (sessionId) {
    const { data: session } = await supabase
      .from("sessions")
      .select("class_id")
      .eq("id", sessionId)
      .single();
    classId = session?.class_id ?? null;
  }

  const kind = asKind(formData?.get("kind"));

  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      created_by: user.id,
      title: `${QUIZ_KIND_LABEL[kind]} Baru`,
      status: "draft",
      session_id: sessionId,
      class_id: classId,
      // `kind` hanya dikirim kalau bukan default: sebelum migrasi 079 kolomnya
      // belum ada, dan menyebutnya akan menggagalkan insert. Dengan begini
      // membuat Asesmen tetap jalan, sementara Remedial/Try Out gagal dengan
      // pesan yang jelas di bawah — bukan diam-diam salah kategori.
      ...(kind === "asesmen" ? {} : { kind }),
    })
    .select("id")
    .single();

  if (isMissingKindColumn(error)) throw new Error(MIGRATION_079_HINT);
  if (error || !data) {
    throw new Error(error?.message ?? "Gagal membuat paket soal");
  }

  redirect(`/dashboard/quizzes/${data.id}/edit`);
}

/** Membaca `kind` dari FormData; apa pun yang tidak dikenal jatuh ke asesmen. */
function asKind(raw: FormDataEntryValue | null | undefined): QuizKind {
  const value = String(raw ?? "");
  return value === "remedial" || value === "tryout" ? value : "asesmen";
}

/**
 * Apakah errornya "kolom `kind` belum ada", yaitu migrasi 079 belum dijalankan.
 *
 * Dua kode karena dua lapisan yang berbeda: PostgREST menolak lebih dulu dari
 * schema cache-nya sendiri (`PGRST204`) dan tidak pernah sampai ke Postgres,
 * yang punya `42703` (undefined_column). Yang benar-benar terjadi di praktik
 * adalah yang pertama.
 */
function isMissingKindColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    (error.code === "PGRST204" && (error.message ?? "").includes("'kind'"))
  );
}

const MIGRATION_079_HINT =
  "Kolom `quizzes.kind` belum ada di database. Jalankan migrasi 079 di repo Tera dulu " +
  "(supabase/migrations/079_quiz_kind.sql), lalu coba lagi.";

/** Memindahkan paket soal ke kategori lain — menu tempatnya muncul ikut berubah. */
export async function setQuizKind(quizId: string, formData: FormData) {
  const supabase = await createClient();
  const kind = asKind(formData.get("kind"));

  const { error } = await supabase.from("quizzes").update({ kind }).eq("id", quizId);
  if (isMissingKindColumn(error)) throw new Error(MIGRATION_079_HINT);

  revalidatePath(`/dashboard/quizzes/${quizId}/edit`);
}

/**
 * Menyalin satu paket soal beserta soal-soalnya.
 *
 * Yang sengaja TIDAK ikut: `share_code` (kode harus unik, dan salinan yang
 * belum terbit belum butuh pintu masuk), `session_id`/`class_id` (salinan
 * dibuat untuk dipakai di tempat lain — itu inti gunanya), serta penugasan di
 * `assessments`. Statusnya selalu draf, apa pun status aslinya.
 *
 * `branching` dipetakan ulang ke id soal yang baru. Kalau disalin apa adanya,
 * percabangan salinan akan menunjuk ke soal milik paket aslinya — bug yang
 * baru terlihat saat murid mengerjakannya.
 */
export async function duplicateQuiz(quizId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `select("*")` supaya `kind` ikut kalau migrasi 079 sudah jalan, dan tidak
  // menggagalkan query kalau belum.
  const { data: source } = await supabase.from("quizzes").select("*").eq("id", quizId).single();
  if (!source) return;

  const { data: copy, error } = await supabase
    .from("quizzes")
    .insert({
      created_by: user.id,
      title: `${source.title} (salinan)`,
      description: source.description,
      settings: source.settings,
      status: "draft",
      ...(source.kind && source.kind !== "asesmen" ? { kind: source.kind } : {}),
    })
    .select("id")
    .single();
  if (error || !copy) throw new Error(error?.message ?? "Gagal menyalin paket soal");

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  const typedQuestions = (questions ?? []) as Question[];
  if (typedQuestions.length > 0) {
    const { data: inserted } = await supabase
      .from("questions")
      .insert(
        typedQuestions.map((q) => ({
          quiz_id: copy.id,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          correct_answer: q.correct_answer,
          weight: q.weight,
          order_index: q.order_index,
          explanation: q.explanation,
          stimulus_images: q.stimulus_images,
          // Percabangan menyusul setelah semua id baru diketahui.
          branching: null,
        })),
      )
      .select("id, order_index");

    // Peta id lama → id baru lewat `order_index`, satu-satunya kunci yang sama
    // di kedua paket.
    const newIdByOrder = new Map(
      ((inserted ?? []) as { id: string; order_index: number }[]).map((q) => [q.order_index, q.id]),
    );
    const newIdByOldId = new Map(
      typedQuestions.map((q) => [q.id, newIdByOrder.get(q.order_index)]),
    );

    await Promise.all(
      typedQuestions
        .filter((q) => q.branching && Object.keys(q.branching).length > 0)
        .map((q) => {
          const remapped = Object.fromEntries(
            Object.entries(q.branching!).map(([answer, target]) => [
              answer,
              target === BRANCH_END ? BRANCH_END : (newIdByOldId.get(target) ?? BRANCH_END),
            ]),
          );
          return supabase
            .from("questions")
            .update({ branching: remapped })
            .eq("id", newIdByOldId.get(q.id) ?? "");
        }),
    );
  }

  revalidatePath("/dashboard");
}

/**
 * `redirectTo` dioper dari halaman edit (yang harus pindah ke suatu tempat
 * setelah paketnya hilang). Dari daftar, tidak ada tujuan yang perlu dituju:
 * memaksa redirect ke `/dashboard` justru memantulkan admin dari menu Remedial
 * atau Try Out ke Asesmen tanpa sebab.
 */
export async function deleteQuiz(quizId: string, redirectTo?: string) {
  const supabase = await createClient();
  await supabase.from("quizzes").delete().eq("id", quizId);

  revalidatePath("/dashboard", "layout");
  if (redirectTo) redirect(redirectTo);
}

export async function publishQuiz(quizId: string) {
  const supabase = await createClient();

  // The edit page already hides the button in this case; this is the guard that
  // actually keeps a half-finished quiz from reaching students.
  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  const typedQuestions = (questions ?? []) as Question[];
  if (typedQuestions.length === 0 || findQuizIssues(typedQuestions).length > 0) {
    redirect(`/dashboard/quizzes/${quizId}/edit`);
  }

  let shareCode = generateShareCode();
  // Retry a couple times on the unlikely chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase
      .from("quizzes")
      .update({ status: "published", share_code: shareCode })
      .eq("id", quizId);
    if (!error) break;
    shareCode = generateShareCode();
  }

  redirect(`/dashboard/quizzes/${quizId}/edit`);
}
