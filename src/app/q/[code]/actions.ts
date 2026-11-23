"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JENIS_KEJADIAN } from "@/lib/kejadian";

export type StartAttemptResult =
  | { attemptId: string; startedAt?: string; serverNow?: string }
  | { error: string };

export async function startAttempt(
  shareCode: string,
  guestName: string,
  learnerId: string | null,
): Promise<StartAttemptResult> {
  const supabase = await createClient();

  // Seluruh pemeriksaan (terbit, jadwal, batas percobaan, roster) dan pembuatan
  // percobaan ada di `mulai_percobaan_tamu` (migrasi Tera 231): peserta tidak
  // menulis ke tabel `attempts` langsung. Paket bertampilan TKA ditolak di sana
  // juga: peserta TKA masuk dengan kode atau akun.
  const { data, error } = await supabase.rpc("mulai_percobaan_tamu", {
    p_share_code: shareCode,
    p_nama: guestName,
    p_learner: learnerId,
  });
  if (error || !data) return { error: pesanMulaiTamu(error?.message ?? "") };

  // `serverNow` dikirim supaya timer di layar murid tidak ikut jam perangkatnya
  // yang bisa meleset: yang dipakai selisih jam server dan jam perangkat.
  const h = data as { attempt_id: string; started_at: string; server_now: string };
  return { attemptId: h.attempt_id, startedAt: h.started_at, serverNow: h.server_now };
}

function pesanMulaiTamu(pesan: string): string {
  if (pesan.includes("gunakan_kode_atau_akun")) return "Masuk dengan kode peserta atau akun Tera.";
  if (pesan.includes("belum_dibuka")) return "Paket soal belum dibuka.";
  if (pesan.includes("sudah_ditutup")) return "Paket soal sudah ditutup.";
  if (pesan.includes("batas_percobaan")) return "Kamu sudah mencapai batas percobaan untuk paket soal ini.";
  if (pesan.includes("pilih_nama_roster")) return "Pilih namamu dari daftar.";
  if (pesan.includes("nama_wajib")) return "Nama wajib diisi";
  if (pesan.includes("paket_bersesi")) return "Paket soal ini hanya untuk murid yang terdaftar.";
  if (pesan.includes("paket_tidak_tersedia")) return "Paket soal tidak tersedia.";
  return "Gagal memulai paket soal.";
}

/**
 * Apakah percobaan yang tersimpan di perangkat masih layak dilanjutkan?
 *
 * Pemulihan setelah muat ulang (QuizForm) dulu langsung membuka soal dari
 * isi penyimpanan perangkat, tanpa bertanya ke server. Sisa percobaan yang
 * sudah dihapus, sudah dikirim, atau sudah lewat batas waktu membuat peserta
 * langsung terlempar ke soal nomor 1 dan melewati halaman persiapan.
 * Sekarang pemulihan hanya jalan bila percobaannya masih ada, belum dikirim,
 * milik paket ini, dan waktunya belum habis.
 */
export async function percobaanMasihBerjalan(shareCode: string, attemptId: string): Promise<boolean> {
  if (!attemptId) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("percobaan_berjalan", { p_share_code: shareCode, p_attempt: attemptId });
  return data === true;
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

type HasilMulai = { attempt_id: string; started_at: string; server_now: string; nama: string };

/** Mulai (atau lanjutkan) percobaan dengan kode peserta murid luar. */
export async function mulaiDenganKode(shareCode: string, kode: string): Promise<StartAttemptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mulai_percobaan_peserta", { p_share_code: shareCode, p_kode: kode });
  if (error || !data) return { error: pesanMasuk(error?.message ?? "") };
  const h = data as HasilMulai;
  // Kode sudah terbukti benar: simpan juga sebagai sesi kode Tera (cookie yang sama
  // dengan /masuk-kode di Tera, satu alamat), supaya tombol "Kembali ke Beranda Try Out"
  // dan halaman hasil terbuka tanpa memasukkan kode lagi bagi yang masuk lewat tautan WhatsApp.
  const bersih = kode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (bersih) {
    (await cookies()).set("kode_peserta", bersih, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
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
  void quizId; // dibaca dari percobaannya di database, bukan dipercaya dari klien
  const supabase = await createClient();

  // Satu fungsi database (migrasi Tera 231) yang memeriksa percobaan belum
  // dikirim, soal milik paketnya, dan batas waktu paket TKA; hanya kolom
  // `response` yang bisa ditulis peserta, bukan skor.
  const { data, error } = await supabase.rpc("simpan_jawaban", {
    p_attempt: attemptId,
    p_question: questionId,
    p_response: response,
    p_index: questionIndex,
  });
  // Galat database TIDAK boleh diam-diam dianggap berhasil (dulu begitu): jawabannya tidak
  // pernah sampai, padahal penilaian membaca dari database. Yang pasti permanen (percobaan atau
  // soal tidak dikenal) dilaporkan agar antrean membuangnya; sisanya dilempar supaya antrean
  // di layar (`AntreanJawaban`) mencobanya lagi.
  if (error) {
    if (/percobaan_tidak_ditemukan|soal_bukan_milik_paket/.test(error.message)) return { permanen: true as const };
    throw new Error(error.message);
  }
  const hasil = (data ?? {}) as { expired?: boolean };
  if (hasil.expired) return { expired: true as const };
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
 * Kirim percobaan TKA dan KEMBALIKAN alamat hasilnya (tidak redirect di server). Layar ujian
 * memanggil ini dengan pengulangan: bila koneksi putus di tengah pengiriman, panggilannya
 * dicoba lagi dan salinan jawaban di perangkat tidak dihapus sebelum server menjawab sukses.
 * `sudah_dikirim` dianggap sukses (pengiriman sebelumnya sebenarnya sampai).
 */
export async function kirimPercobaan(
  shareCode: string,
  attemptId: string,
): Promise<{ url: string } | { galat: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("kirim_percobaan", { p_attempt_id: attemptId });
  if (error && !error.message.includes("sudah_dikirim")) {
    if (error.message.includes("percobaan_tidak_ditemukan")) return { galat: "tidak_ditemukan" };
    return { galat: "gagal" };
  }
  return { url: `/q/${shareCode}/result/${attemptId}` };
}

/**
 * Jawaban yang sudah tersimpan di server untuk percobaan yang belum dikirim (migrasi Tera 234).
 * Dipakai saat peserta melanjutkan tanpa salinan di perangkat. Null bila fungsinya belum ada
 * atau gagal: layar lanjut dengan jawaban kosong seperti sebelumnya.
 */
export async function jawabanTersimpan(
  attemptId: string,
): Promise<{ responses: Record<string, unknown>; index: number } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("jawaban_tersimpan", { p_attempt: attemptId });
    if (error || !data) return null;
    const d = data as { responses?: Record<string, unknown>; index?: number };
    return { responses: d.responses ?? {}, index: d.index ?? 0 };
  } catch {
    return null;
  }
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
  void quizId;
  if (!(JENIS_KEJADIAN as readonly string[]).includes(jenis)) return;
  try {
    const supabase = await createClient();
    await supabase.rpc("catat_kejadian", {
      p_attempt: attemptId,
      p_kind: jenis,
      p_durasi_ms: typeof durasiMs === "number" && Number.isFinite(durasiMs) ? Math.round(durasiMs) : null,
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
    await supabase.rpc("catat_posisi", { p_attempt: attemptId, p_nomor: nomorAsli });
  } catch {
    /* denyut tidak boleh mengganggu ujian */
  }
}
