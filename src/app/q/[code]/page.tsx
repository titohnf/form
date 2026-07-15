import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Question, Quiz } from "@/lib/types";
import QuizForm from "./QuizForm";
import { submitAttempt } from "./actions";

export default async function PublicQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, description, status")
    .eq("share_code", code)
    .eq("status", "published")
    .single();

  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("id, quiz_id, type, prompt, options, weight, order_index")
    .eq("quiz_id", quiz.id)
    .order("order_index", { ascending: true });

  const boundSubmit = submitAttempt.bind(null, code);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{(quiz as Quiz).title}</h1>
      {quiz.description && <p className="mt-1 text-gray-500">{quiz.description}</p>}

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6">
        <QuizForm questions={(questions ?? []) as Question[]} action={boundSubmit} />
      </div>
    </div>
  );
}
