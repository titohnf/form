import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";
import LiveMonitor from "./LiveMonitor";

export default async function LiveMonitoringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("id, title").eq("id", id).single();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  const { data: attempts } = await supabase.from("attempts").select("*").eq("quiz_id", id);

  const { data: answers } = await supabase.from("answers").select("*").eq("quiz_id", id);

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/quizzes/${id}/edit`} className="text-sm text-gray-500 underline">
        ← Kembali ke Editor
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">Live Monitoring: {(quiz as Quiz).title}</h1>
      <p className="text-sm text-gray-500">Halaman ini update otomatis saat murid mengerjakan.</p>

      <LiveMonitor
        quizId={id}
        questions={(questions ?? []) as Question[]}
        initialAttempts={(attempts ?? []) as Attempt[]}
        initialAnswers={(answers ?? []) as Answer[]}
      />
    </div>
  );
}
