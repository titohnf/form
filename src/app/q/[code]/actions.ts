"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuizSettings } from "@/lib/types";
import { JENIS_KEJADIAN } from "@/lib/kejadian";

export type StartAttemptResult =
  | { attemptId: string; startedAt?: string; serverNow?: string }
  | { error: string };

/** Toleransi setelah batas waktu habis, untuk jawaban terakhir yang sedang dalam perjalanan. */
const TOLERANSI_DETIK = 60;

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

  // Try out bertampilan TKA tidak lagi menerima nama bebas: peserta masuk dengan
  // kode peserta atau akun Tera supaya hasilnya pasti milik siapa.
  if (settings.cbt_mode) {
    return { error: "Masuk dengan kode peserta atau akun Tera." };
  }

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
    .select("id, started_at")
    .single();

  if (error || !attempt) {
    return { error: "Gagal memulai paket soal." };
  }

  // `serverNow` dikirim supaya timer di layar murid tidak ikut jam perangkatnya
  // yang bisa meleset: yang dipakai selisih jam server dan jam perangkat.
  return { attemptId: attempt.id, startedAt: attempt.started_at, serverNow: new Date().toISOString() };
}

/** Pesan untuk peserta dari kode galat fungsi database (migrasi Tera 227). */
function pesanMasuk(pesan: string): string {
  if (pesan.includes("kode_tidak_dikenal")) return "Kode tidak dikenal. Periksa lagi kodenya, atau tanya tutor.";
  if (pesan.includes("sudah_mengerjakan")) return "Kamu sudah mengerjakan try out ini.";
  if (pesan.includes("belum_dibuka")) return "Paket soal belum dibuka.";
  if (pesan.includes("sudah_ditutup")) return "Paket soal sudah ditutup.";
  if (pesan.includes("paket_tidak_tersedia")) return "Paket soal tidak tersedia.";
  if (pesan.includes("bukan_siswa")) return "Akun ini bukan akun siswa. Masuk dengan akun siswa, atau pakai kode peserta.";
  if (pesan.includes("belum_masuk")) return "Sesi masukmu habis. Masuk lagi dengan akun Tera.";
  return "Tidak bisa memulai. Coba lagi, atau tanya tutor.";
}

/** Memeriksa kode peserta; hanya mengembalikan nama untuk layar konfirmasi. */
export async function cekKodePeserta(kode: string): Promise<{ nama: string } | { error: string }> {
  const bersih = kode.trim();
  if (!bersih) return { error: "Kode wajib diisi." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("masuk_peserta", { p_kode: bersih });
  if (error) return { error: "Tidak bisa memeriksa kode. Coba lagi." };
  if (!data) return { error: "Kode tidak dikenal. Periksa lagi kodenya, atau tanya tutor." };
  return { nama: data as string };
}

type HasilMulai = { attempt_id: string; started_at: string; server_now: string; nama: string };

/** Mulai (atau lanjutkan) percobaan dengan kode peserta murid luar. */
export async function mulaiDenganKode(shareCode: string, kode: string): Promise<StartAttemptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mulai_percobaan_peserta", { p_share_code: shareCode, p_kode: kode });
  if (error || !data) return { error: pesanMasuk(error?.message ?? "") };
  const h = data as HasilMulai;
  return { attemptId: h.attempt_id, startedAt: h.started_at, serverNow: h.server_now };
}

/** Mulai (atau lanjutkan) percobaan siswa Tera yang sedang login. */
export async function mulaiDenganAkun(shareCode: string): Promise<StartAttemptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mulai_percobaan_akun", { p_share_code: shareCode });
  if (error || !data) return { error: pesanMasuk(error?.message ?? "") };
  const h = data as HasilMulai;
  return { attemptId: h.attempt_id, startedAt: h.started_at, serverNow: h.server_now };
}

export async function saveAnswer(
  quizId: string,
  attemptId: string,
  questionId: string,
  response: unknown,
  questionIndex: number,
) {
  const supabase = await createClient();

  // Batas waktu hanya ditegakkan untuk paket bertampilan TKA. Paket lain boleh
  // punya `time_limit_minutes` yang selama ini tidak pernah dipakai, dan
  // menegakkannya sekarang akan menolak jawaban murid di paket yang tidak
  // pernah dirancang dengan batas itu.
  const { data: percobaan } = await supabase
    .from("attempts")
    .select("started_at, quizzes(settings)")
    .eq("id", attemptId)
    .maybeSingle();
  const pengaturan = ((percobaan as unknown as { quizzes: { settings: Partial<QuizSettings> | null } | null } | null)
    ?.quizzes?.settings ?? {}) as Partial<QuizSettings>;
  if (percobaan && pengaturan.cbt_mode && pengaturan.time_limit_minutes) {
    const batas = new Date(percobaan.started_at).getTime() + (pengaturan.time_limit_minutes * 60 + TOLERANSI_DETIK) * 1000;
    if (Date.now() > batas) return { expired: true as const };
  }

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

  // Seluruh penilaian terjadi di database (`kirim_percobaan`, migrasi Tera
  // 225): ia membaca soal beserta kuncinya, menilai lewat `nilai_jawaban_banyak()`
  // (satu-satunya definisi aturan skoring, dipakai bersama Sora dan Tera),
  // menulis skor tiap jawaban, dan menutup percobaan. Kunci jawaban tidak
  // pernah meninggalkan database, dan percobaan yang sudah dikirim ditolak
  // sehingga skornya tidak bisa dinilai ulang atau ditimpa.
  const { error } = await supabase.rpc("kirim_percobaan", { p_attempt_id: attemptId });

  if (error) {
    // Terkirim dua kali (klik ganda, muat ulang): hasilnya sudah ada.
    if (error.message.includes("sudah_dikirim")) {
      redirect(`/q/${shareCode}/result/${attemptId}`);
    }
    if (error.message.includes("percobaan_tidak_ditemukan")) {
      redirect(`/q/${shareCode}?error=Percobaan+tidak+ditemukan`);
    }
    redirect(`/q/${shareCode}?error=Gagal+menilai+jawaban`);
  }

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

/**
 * Mencatat satu kejadian selama peserta mengerjakan (keluar halaman, mencoba
 * menyalin, dst). Hanya mencatat: tidak mengubah nilai dan tidak mengirim
 * paksa. Sengaja diam-diam bila gagal: tabelnya (migrasi Tera 223) mungkin
 * belum dibuat, dan itu tidak boleh mengganggu peserta yang sedang ujian.
 * Yang boleh masuk dibatasi di database (percobaan harus berjalan dan paketnya
 * terbit), dan di sini jenisnya dibatasi pada daftar yang dikenal.
 */
export async function catatKejadian(quizId: string, attemptId: string, jenis: string, durasiMs?: number) {
  if (!(JENIS_KEJADIAN as readonly string[]).includes(jenis)) return;
  try {
    const supabase = await createClient();
    await supabase.from("attempt_events").insert({
      attempt_id: attemptId,
      quiz_id: quizId,
      kind: jenis,
      durasi_ms: typeof durasiMs === "number" && Number.isFinite(durasiMs) ? Math.min(Math.max(0, Math.round(durasiMs)), 86_400_000) : null,
    });
  } catch {
    /* pencatatan tidak boleh mengganggu ujian */
  }
}

/**
 * Denyut posisi: layar ujian mengirim nomor soal yang sedang dibuka (nomor
 * ASLI, bukan urutan acak peserta) supaya halaman Live Monitoring tahu di mana
 * peserta berada, bukan hanya soal yang terakhir ia jawab. Sekaligus
 * memperbarui `last_active_at`, jadi peserta yang menutup tab tampak tidak aktif.
 * Hanya untuk percobaan yang belum dikirim; gagal diam-diam.
 */
export async function catatPosisi(attemptId: string, nomorAsli: number) {
  if (!Number.isInteger(nomorAsli) || nomorAsli < 0 || nomorAsli > 1000) return;
  try {
    const supabase = await createClient();
    await supabase
      .from("attempts")
      .update({ current_question_index: nomorAsli, last_active_at: new Date().toISOString() })
      .eq("id", attemptId)
      .is("submitted_at", null);
  } catch {
    /* denyut tidak boleh mengganggu ujian */
  }
}
