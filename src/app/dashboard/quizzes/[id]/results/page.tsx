import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attempt, Quiz } from "@/lib/types";

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

  const { data: questions } = await supabase.from("questions").select("weight").eq("quiz_id", id);
  const totalWeight = (questions ?? []).reduce((sum, q) => sum + Number(q.weight), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/dashboard/quizzes/${id}/edit`} className="text-sm text-gray-500 underline">
        ← Kembali ke Editor
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">Hasil: {(quiz as Quiz).title}</h1>

      <div className="flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
        {(attempts ?? []).length === 0 && (
          <p className="p-6 text-sm text-gray-500">Belum ada murid yang mengerjakan kuis ini.</p>
        )}
        {(attempts as Attempt[] | null)?.map((attempt) => (
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
