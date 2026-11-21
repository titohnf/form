import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz, QuizSettings } from "@/lib/types";
import LiveMonitor, { type KejadianBaris } from "./LiveMonitor";
import { sekarangMs } from "@/lib/waktu";

export default async function LiveMonitoringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("id, title, settings").eq("id", id).single();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  const { data: attempts } = await supabase.from("attempts").select("*").eq("quiz_id", id);

  const { data: answers } = await supabase.from("answers").select("*").eq("quiz_id", id);

  // Catatan kejadian (migrasi Tera 223); kosong bila tabelnya belum ada.
  const { data: kejadian } = await supabase
    .from("attempt_events")
    .select("id, attempt_id, kind, durasi_ms, created_at")
    .eq("quiz_id", id)
    .order("created_at", { ascending: false })
    .limit(1000);

  const pengaturan = ((quiz as { settings: Partial<QuizSettings> | null }).settings ?? {}) as Partial<QuizSettings>;

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/quizzes/${id}/edit`} className="text-sm text-gray-500 underline">
        ← Kembali ke Editor
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">Live Monitoring: {(quiz as Quiz).title}</h1>
      <p className="text-sm text-gray-500">Halaman ini update otomatis saat murid mengerjakan: posisi soal, jawaban, sisa waktu, dan catatan kejadian.</p>

      <LiveMonitor
        quizId={id}
        questions={(questions ?? []) as Question[]}
        initialAttempts={(attempts ?? []) as Attempt[]}
        initialAnswers={(answers ?? []) as Answer[]}
        initialEvents={(kejadian ?? []) as KejadianBaris[]}
        waktuServer={sekarangMs()}
        timeLimitMinutes={pengaturan.cbt_mode ? (pengaturan.time_limit_minutes ?? null) : null}
      />
    </div>
  );
}
