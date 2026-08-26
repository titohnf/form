import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";
import { rankAttempts, computeBadges } from "@/lib/gamification";
import { perQuestionAccuracy } from "@/lib/question-stats";
import { MathText } from "@/lib/latex";
import { ringkasIsiSoal } from "@/lib/isi-soal";
import RemedialBuilder from "./RemedialBuilder";

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
  const totalWeight = typedQuestions.reduce((sum, q) => sum + Number(q.weight), 0);

  const perQuestionStats = perQuestionAccuracy(typedQuestions, typedAnswers, typedAttempts);

  const ranked = rankAttempts(typedAttempts);

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/quizzes/${id}/edit`} className="text-sm text-gray-500 underline">
        ← Kembali ke Editor
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Hasil: {(quiz as Quiz).title}</h1>
        <a
          href={`/dashboard/quizzes/${id}/results/export`}
          className="text-sm font-medium underline"
        >
          Export CSV ↓
        </a>
      </div>

      {perQuestionStats.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Analitik per Soal</h2>
          <div className="flex flex-col gap-2">
            {perQuestionStats.map(({ question, accuracy, answeredCount }, i) => (
              <div key={question.id} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-gray-400">{i + 1}.</span>
                <span className="flex-1 truncate">
                  <MathText text={ringkasIsiSoal(question.prompt)} />
                </span>
                <span className="text-gray-500">
                  {accuracy === null ? "belum ada data" : `${accuracy}% benar (${answeredCount} jawaban)`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hanya masuk akal kalau sudah ada yang dinilai — sebelum itu tidak ada
          "sering salah" untuk dijadikan dasar. */}
      {perQuestionStats.some((s) => s.accuracy !== null) && (
        <RemedialBuilder
          quizId={id}
          accuracies={perQuestionStats
            .map((s) => s.accuracy)
            .filter((a): a is number => a !== null)}
        />
      )}

      {ranked.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-500">🏆 Leaderboard</h2>
          <div className="flex flex-col gap-1">
            {ranked.slice(0, 10).map(({ attempt, rank }) => {
              const badges = computeBadges(attempt, totalWeight, ranked);
              return (
                <div key={attempt.id} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-gray-400">#{rank}</span>
                  <span className="flex-1">{attempt.guest_name}</span>
                  {badges.map((b) => (
                    <span key={b.label} title={b.label}>
                      {b.emoji}
                    </span>
                  ))}
                  <span className="font-medium">{attempt.total_score} / {totalWeight}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {typedAttempts.length === 0 && (
          <p className="p-6 text-sm text-gray-500">Belum ada murid yang mengerjakan paket soal ini.</p>
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
