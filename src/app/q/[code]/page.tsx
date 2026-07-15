import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { McqOptions, Question, Quiz, QuizSettings } from "@/lib/types";
import QuizForm from "./QuizForm";

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

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
    .select("id, title, description, status, settings, class_id")
    .eq("share_code", code)
    .eq("status", "published")
    .single();

  if (!quiz) notFound();

  const typedQuiz = quiz as Pick<Quiz, "id" | "title" | "description" | "status" | "settings" | "class_id">;
  const settings = (typedQuiz.settings ?? {}) as Partial<QuizSettings>;
  const now = new Date();

  const notYetOpen = settings.opens_at && now < new Date(settings.opens_at);
  const alreadyClosed = settings.closes_at && now > new Date(settings.closes_at);

  const { data: questions } = await supabase
    .from("questions")
    .select("id, quiz_id, type, prompt, options, weight, order_index, branching")
    .eq("quiz_id", typedQuiz.id)
    .order("order_index", { ascending: true });

  let orderedQuestions = (questions ?? []) as Question[];
  // Shuffling questions would break branching's order_index-based fallback, so it's ignored
  // in sequential mode (a quiz author using branching wants a deliberate path).
  if (settings.shuffle_questions && !settings.sequential_mode) {
    orderedQuestions = shuffle(orderedQuestions);
  }
  if (settings.shuffle_choices) {
    orderedQuestions = orderedQuestions.map((q) => {
      if (q.type === "mcq_single" || q.type === "mcq_multi") {
        const opts = q.options as McqOptions | null;
        if (opts?.choices) {
          return { ...q, options: { choices: shuffle(opts.choices) } };
        }
      }
      return q;
    });
  }

  const students = typedQuiz.class_id
    ? (
        await supabase
          .from("students")
          .select("id, name")
          .eq("class_id", typedQuiz.class_id)
          .order("name")
      ).data ?? []
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{typedQuiz.title}</h1>
      {typedQuiz.description && <p className="mt-1 text-gray-500">{typedQuiz.description}</p>}

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {notYetOpen ? (
        <p className="mt-6 rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Kuis ini belum dibuka. Coba lagi nanti.
        </p>
      ) : alreadyClosed ? (
        <p className="mt-6 rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Kuis ini sudah ditutup.
        </p>
      ) : (
        <div className="mt-6">
          <QuizForm
            quizId={typedQuiz.id}
            shareCode={code}
            questions={orderedQuestions}
            students={students}
            sequential={settings.sequential_mode ?? false}
          />
        </div>
      )}
    </div>
  );
}
