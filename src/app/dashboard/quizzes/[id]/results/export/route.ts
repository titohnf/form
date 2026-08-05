import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("*").eq("id", id).single();
  if (!quiz) {
    return NextResponse.json({ error: "Paket soal tidak ditemukan" }, { status: 404 });
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  const { data: attempts } = await supabase
    .from("attempts")
    .select("*")
    .eq("quiz_id", id)
    .order("submitted_at", { ascending: false });

  const { data: answers } = await supabase.from("answers").select("*").eq("quiz_id", id);

  const typedQuestions = (questions ?? []) as Question[];
  const typedAttempts = (attempts ?? []) as Attempt[];
  const typedAnswers = (answers ?? []) as Answer[];

  const header = [
    "Nama",
    "Waktu Submit",
    ...typedQuestions.map((q, i) => `Soal ${i + 1} (${q.weight})`),
    "Total Skor",
  ];

  const rows = typedAttempts.map((attempt) => {
    const attemptAnswers = typedAnswers.filter((a) => a.attempt_id === attempt.id);
    const scores = typedQuestions.map((q) => {
      const a = attemptAnswers.find((x) => x.question_id === q.id);
      if (!a) return "";
      return a.needs_manual_grading ? (a.manual_score ?? "belum dinilai") : (a.auto_score ?? "");
    });
    return [
      attempt.guest_name,
      attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString("id-ID") : "",
      ...scores,
      attempt.total_score ?? "",
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `${(quiz as Quiz).title.replace(/[^a-z0-9]+/gi, "_")}_hasil.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
