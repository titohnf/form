"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { generateShareCode } from "@/lib/share-code";

/**
 * Membuat paket soal untuk satu sesi DAN menugaskannya sekaligus, lalu membuka
 * editornya.
 *
 * Dua langkah dalam satu aksi bukan kemalasan: kalau paketnya lahir lepas,
 * admin harus kembali ke daftar, membuka editor, lalu mencari lagi sesi yang
 * tadi ia lihat di pemilih yang isinya ratusan baris — persis friksi yang
 * membuat sesi terlewat sejak awal. Halaman ini ada untuk menutup lingkaran
 * itu, jadi penugasannya ikut di sini.
 */
export async function createQuizForSession(sessionId: string) {
  const supabase = await createClient();
  const { id: userId, isTutor } = await getCurrentUser();
  if (!userId) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("class_id, topic, scheduled_at")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Sesi tidak ditemukan atau tidak terbuka untuk akun ini.");

  const when = new Date(session.scheduled_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const title = session.topic ? `Asesmen — ${session.topic}` : `Asesmen ${when}`;

  // Sumbu kepemilikan (migrasi 074): paket buatan admin sengaja bernilai null
  // supaya tidak ada tutor yang bisa menyuntingnya. Untuk tutor kebalikannya —
  // policy 071 memberi hak HANYA lewat `session_id`, jadi tanpa ini tutor tidak
  // bisa mengedit paket yang baru saja ia minta dibuatkan.
  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      created_by: userId,
      title,
      status: "draft",
      session_id: isTutor ? sessionId : null,
      class_id: session.class_id ?? null,
    })
    .select("id")
    .single();
  if (quizError || !quiz) throw new Error(quizError?.message ?? "Gagal membuat paket soal");

  // Share code unik lintas penugasan; tabrakan diulang, pola yang sama dengan
  // `assignToSession` dan `publishQuiz`.
  let assignError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("assessments").insert({
      session_id: sessionId,
      created_by: userId,
      quiz_id: quiz.id,
      title,
      description: "Dinilai otomatis dari Sora.",
      max_score: 100,
      share_code: generateShareCode(),
    });
    assignError = error?.message ?? null;
    if (!error) break;
    if (error.code !== "23505") break;
  }
  if (assignError) {
    // Paketnya sudah terlanjur ada tapi tidak menempel ke sesi mana pun; kalau
    // dibiarkan ia jadi paket yatim yang akan muncul lagi sebagai "sesi belum
    // bersoal" di kunjungan berikutnya.
    await supabase.from("quizzes").delete().eq("id", quiz.id);
    throw new Error(`Gagal menugaskan ke sesi: ${assignError}`);
  }

  revalidatePath("/dashboard/sesi");
  redirect(`/dashboard/quizzes/${quiz.id}/edit?dari=asesmen`);
}

/**
 * Menugaskan paket soal yang SUDAH ada ke satu sesi.
 *
 * Dulu ini hidup di editor paket, dari arah "paket ini dipakai di sesi mana".
 * Dipindah ke sini karena arah itulah yang membuat sesi terlewat: selama
 * penugasan hanya bisa dimulai dari paket, sesi yang tidak pernah dibuka
 * siapa pun tidak pernah muncul di layar mana pun.
 */
export async function assignExistingToSession(sessionId: string, formData: FormData) {
  const supabase = await createClient();
  const { id: userId } = await getCurrentUser();
  if (!userId) redirect("/login");

  const quizId = String(formData.get("quiz_id") ?? "").trim();
  if (!quizId) return;

  const { data: quiz } = await supabase.from("quizzes").select("title").eq("id", quizId).single();
  if (!quiz) return;

  // Tidak ada unique index (quiz_id, session_id) di DB — dua penugasan ke sesi
  // yang sama hanya akan memberi dua kode untuk hal yang sama.
  const { data: existing } = await supabase
    .from("assessments")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/dashboard/sesi");
    return;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("assessments").insert({
      session_id: sessionId,
      created_by: userId,
      quiz_id: quizId,
      title: quiz.title,
      description: "Dinilai otomatis dari Sora.",
      max_score: 100,
      share_code: generateShareCode(),
    });
    if (!error) break;
    if (error.code !== "23505") throw new Error(error.message);
  }

  revalidatePath("/dashboard/sesi");
}

/**
 * Menarik satu penugasan. Menolak kalau sudah ada nilai di sesi itu:
 * `assessment_results` ikut terhapus lewat cascade, dan nilai yang sudah masuk
 * rapor Tera tidak boleh hilang gara-gara satu klik di sini.
 */
export async function unassignSession(assessmentId: string) {
  const supabase = await createClient();

  const { count } = await supabase
    .from("assessment_results")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (count && count > 0) return;

  await supabase.from("assessments").delete().eq("id", assessmentId);
  revalidatePath("/dashboard/sesi");
}
