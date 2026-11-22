import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attempt, QuizSettings } from "@/lib/types";
import { rankAttempts, computeBadges } from "@/lib/gamification";

/** Angka untuk dibaca anak: paling banyak satu desimal, koma desimal (nilai sebagian dari soal tabel bisa pecahan). */
const angka = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

export default async function AttemptResultPage({
  params,
}: {
  params: Promise<{ code: string; attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();

  // Percobaan SENDIRI dibaca lewat fungsi database (migrasi Tera 231): peserta
  // tidak boleh membaca tabel `attempts`, tempat nama dan skor semua peserta.
  const { data: paket } = await supabase.rpc("hasil_percobaan", { p_attempt: attemptId });
  const hasil = paket as { attempt: Attempt; settings: Partial<QuizSettings>; lainnya: Pick<Attempt, "id" | "started_at" | "submitted_at" | "total_score">[] } | null;
  if (!hasil) notFound();
  const attempt = hasil.attempt;

  // Total bobot dari fungsi database: peserta tidak lagi boleh membaca tabel
  // `questions` (tempat kunci jawaban), jadi tidak bisa menjumlahkannya sendiri.
  const { data: bobot } = await supabase.rpc("bobot_paket", { p_quiz_id: attempt.quiz_id });
  const totalWeight = Number(bobot ?? 0);

  // Beranda try out ada di Tera (satu alamat dengan Sora). Tujuannya menurut siapa pesertanya:
  //  - akun mandiri       -> /mandiri/tryout
  //  - murid bimbel (akun `student`) tidak punya beranda di Tera: hasilnya dilihat orang tua
  //    di akun keluarga, jadi tidak ada tombol
  //  - selain itu (peserta berkode, atau admin/tutor yang sedang mencoba) -> /umum/tryout
  //    bila sesi kodenya ada (disimpan saat mulai), kalau tidak ke beranda Tera.
  const {
    data: { user: penggunaLogin },
  } = await supabase.auth.getUser();
  let peran: string | null = null;
  if (penggunaLogin) {
    const { data: profil } = await supabase.from("profiles").select("role").eq("id", penggunaLogin.id).maybeSingle();
    peran = (profil?.role as string | undefined) ?? null;
  }
  const punyaKode = Boolean((await cookies()).get("kode_peserta")?.value);
  const muridBimbel = peran === "student";
  const berandaTryOut = peran === "mandiri" ? "/mandiri/tryout" : punyaKode ? "/umum/tryout" : "/";
  const hasilHref = berandaTryOut === "/" ? null : `${berandaTryOut}/${attempt.quiz_id}`;

  const typedAttempt = attempt;
  const settings = hasil.settings ?? {};
  const hasPendingGrading = typedAttempt.total_score === null;
  const showScore = settings.show_score_immediately ?? true;

  let rank: number | null = null;
  let badges: { emoji: string; label: string }[] = [];
  // Paket bertampilan TKA tidak memakai peringkat maupun lencana: itu ujian,
  // bukan permainan, dan murid tidak perlu tahu posisinya terhadap peserta lain.
  if (showScore && !hasPendingGrading && !settings.cbt_mode) {
    // Hanya angka (waktu dan skor) percobaan lain, tanpa nama, dari fungsi yang sama.
    const allAttempts = hasil.lainnya.map((x) => ({
      ...x,
      quiz_id: typedAttempt.quiz_id,
      guest_name: "",
      current_question_index: 0,
      last_active_at: x.submitted_at ?? x.started_at,
      learner_id: null,
    }));
    const ranked = rankAttempts(allAttempts as Attempt[]);
    rank = ranked.find((r) => r.attempt.id === typedAttempt.id)?.rank ?? null;
    badges = computeBadges(typedAttempt, totalWeight, ranked);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Terima kasih, {typedAttempt.guest_name}!</h1>
      <p className="mt-1 text-gray-500">Jawabanmu sudah terkirim.</p>

      <div className="mt-6 rounded border border-gray-200 p-6 text-center">
        {!showScore ? (
          <>
            <p className="text-lg font-medium text-gray-600">
              Skor akan diumumkan oleh tutor.
            </p>
            {settings.cbt_mode && muridBimbel && (
              <p className="mt-3 text-sm text-gray-500">
                Hasilnya bisa dilihat orang tuamu di akun keluarga setelah hasilnya dibuka.
              </p>
            )}
            {settings.cbt_mode && !muridBimbel && hasilHref && (
              <p className="mt-3 text-sm text-gray-500">
                Kamu bisa melihat hasilnya lewat{" "}
                <a href={hasilHref} className="font-medium text-[#1b4f94] underline">
                  halaman Try Out
                </a>{" "}
                setelah hasilnya dibuka, tanpa perlu memasukkan kode lagi.
              </p>
            )}
          </>
        ) : hasPendingGrading ? (
          <p className="text-lg font-medium text-yellow-700">
            Sebagian soal (esai) menunggu penilaian tutor.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">Skor kamu</p>
            <p className="text-4xl font-semibold">
              {angka(typedAttempt.total_score ?? 0)} / {angka(totalWeight)}
            </p>
            {settings.cbt_mode && totalWeight > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Nilai: {angka(((typedAttempt.total_score ?? 0) / totalWeight) * 100)} dari 100
              </p>
            )}
            {settings.cbt_mode && (
              <p className="mt-4 text-sm text-gray-500">
                Pembahasan dan rincian penguasaan tiap kompetensi akan dibuka setelah tutor mengumumkan hasil
                {!muridBimbel && hasilHref ? (
                  <>
                    {" "}
                    di{" "}
                    <a href={hasilHref} className="font-medium text-[#1b4f94] underline">
                      halaman Try Out
                    </a>
                  </>
                ) : (
                  ""
                )}
                .
              </p>
            )}
            {rank && <p className="mt-1 text-sm text-gray-500">Peringkat #{rank}</p>}
            {badges.length > 0 && (
              <p className="mt-2 text-2xl">
                {badges.map((b) => (
                  <span key={b.label} title={b.label}>
                    {b.emoji}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>

      {/* Anchor biasa, bukan Link: tujuannya di luar basePath Sora (/tryout). */}
      {!muridBimbel && (
        <div className="mt-6 text-center">
          <a href={berandaTryOut} className="inline-block rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Kembali ke Beranda Try Out
          </a>
        </div>
      )}
    </div>
  );
}