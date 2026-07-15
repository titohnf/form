import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";

export default async function QuizResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("id, title").eq("id", id).single();
  if (!quiz) notFound();

  const { data: attempts } = await supabase
    .from("attempts")
    .select("*")
    .eq("quiz_id", id)
    .order("submitted_at", { ascending: false });

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  const { data: answers } = await supabase.from("answers").select("*").eq("quiz_id", id);

  const typedQuestions = (questions ?? []) as Question[];
  const typedAnswers = (answers ?? []) as Answer[];
  const typedAttempts = (attempts as Attempt[] | null) ?? [];
  const submittedAttempts = typedAttempts.filter((a) => a.submitted_at);
  const totalWeight = typedQuestions.reduce((sum, q) => sum + Number(q.weight), 0);

  const perQuestionStats = typedQuestions.map((question) => {
    const relevant = typedAnswers.filter(
      (a) => a.question_id === question.id && submittedAttempts.some((at) => at.id === a.attempt_id),
    );
    const graded = relevant.filter(
      (a) => !a.needs_manual_grading || a.manual_score !== null,
    );
    const correctFraction = graded.reduce((sum, a) => {
      const score = a.needs_manual_grading ? (a.manual_score ?? 0) : (a.auto_score ?? 0);
      return sum + score / (question.weight || 1);
    }, 0);
    const accuracy = graded.length > 0 ? Math.round((correctFraction / graded.length) * 100) : null;
    return { question, accuracy, answeredCount: relevant.length };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/dashboard/quizzes/${id}/edit`} className="text-sm text-gray-500 underline">
        ← Kembali ke Editor
      </Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hasil: {(quiz as Quiz).title}</h1>
        <a
          href={`/dashboard/quizzes/${id}/results/export`}
          className="text-sm font-medium underline"
        >
          Export CSV ↓
        </a>
      </div>

      {perQuestionStats.length > 0 && (
        <div className="mb-8 rounded border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Analitik per Soal</h2>
          <div className="flex flex-col gap-2">
            {perQuestionStats.map(({ question, accuracy, answeredCount }, i) => (
              <div key={question.id} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-gray-400">{i + 1}.</span>
                <span className="flex-1 truncate">{question.prompt}</span>
                <span className="text-gray-500">
                  {accuracy === null ? "belum ada data" : `${accuracy}% benar (${answeredCount} jawaban)`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
        {typedAttempts.length === 0 && (
          <p className="p-6 text-sm text-gray-500">Belum ada murid yang mengerjakan kuis ini.</p>
        )}
        {typedAttempts.map((attempt) => (
          <Link
            key={attempt.id}
            href={`/dashboard/quizzes/${id}/results/${attempt.id}`}
            className="flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <div>
              <p className="font-medium">{attempt.guest_name}</p>
              <p className="text-sm text-gray-500">
                {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString("id-ID") : "Belum submit"}
              </p>
            </div>
            <span className="text-sm font-medium">
              {attempt.total_score === null ? "Perlu dinilai" : `${attempt.total_score} / ${totalWeight}`}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
