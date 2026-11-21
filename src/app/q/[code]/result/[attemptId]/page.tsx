import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attempt, QuizSettings } from "@/lib/types";
import { rankAttempts, computeBadges } from "@/lib/gamification";

export default async function AttemptResultPage({
  params,
}: {
  params: Promise<{ code: string; attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("*, quizzes(settings)")
    .eq("id", attemptId)
    .single();

  if (!attempt) notFound();

  // Total bobot dari fungsi database: peserta tidak lagi boleh membaca tabel
  // `questions` (tempat kunci jawaban), jadi tidak bisa menjumlahkannya sendiri.
  const { data: bobot } = await supabase.rpc("bobot_paket", { p_quiz_id: attempt.quiz_id });
  const totalWeight = Number(bobot ?? 0);

  const typedAttempt = attempt as Attempt;
  const settings = ((attempt as unknown as { quizzes: { settings: Partial<QuizSettings> } }).quizzes
    ?.settings ?? {}) as Partial<QuizSettings>;
  const hasPendingGrading = typedAttempt.total_score === null;
  const showScore = settings.show_score_immediately ?? true;

  let rank: number | null = null;
  let badges: { emoji: string; label: string }[] = [];
  // Paket bertampilan TKA tidak memakai peringkat maupun lencana: itu ujian,
  // bukan permainan, dan murid tidak perlu tahu posisinya terhadap peserta lain.
  if (showScore && !hasPendingGrading && !settings.cbt_mode) {
    const { data: allAttempts } = await supabase
      .from("attempts")
      .select("*")
      .eq("quiz_id", typedAttempt.quiz_id);
    const ranked = rankAttempts((allAttempts ?? []) as Attempt[]);
    rank = ranked.find((r) => r.attempt.id === typedAttempt.id)?.rank ?? null;
    badges = computeBadges(typedAttempt, totalWeight, ranked);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Terima kasih, {typedAttempt.guest_name}!</h1>
      <p className="mt-1 text-gray-500">Jawabanmu sudah terkirim.</p>

      <div className="mt-6 rounded border border-gray-200 p-6 text-center">
        {!showScore ? (
          <p className="text-lg font-medium text-gray-600">
            Skor akan diumumkan oleh tutor.
          </p>
        ) : hasPendingGrading ? (
          <p className="text-lg font-medium text-yellow-700">
            Sebagian soal (esai) menunggu penilaian tutor.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">Skor kamu</p>
            <p className="text-4xl font-semibold">
              {typedAttempt.total_score} / {totalWeight}
            </p>
            {settings.cbt_mode && totalWeight > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Nilai: {Math.round(((typedAttempt.total_score ?? 0) / totalWeight) * 1000) / 10} dari 100
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
    </div>
  );
}
