import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attempt, Question, QuizSettings } from "@/lib/types";

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

  const { data: answers } = await supabase
    .from("answers")
    .select("*, questions(prompt, weight, type)")
    .eq("attempt_id", attemptId);

  const totalWeight = ((answers ?? []) as unknown as { questions: Question }[]).reduce(
    (sum, a) => sum + (a.questions?.weight ?? 0),
    0,
  );

  const typedAttempt = attempt as Attempt;
  const settings = ((attempt as unknown as { quizzes: { settings: Partial<QuizSettings> } }).quizzes
    ?.settings ?? {}) as Partial<QuizSettings>;
  const hasPendingGrading = typedAttempt.total_score === null;
  const showScore = settings.show_score_immediately ?? true;

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
          </>
        )}
      </div>
    </div>
  );
}
