import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attempt, Question } from "@/lib/types";
import { MathText } from "@/lib/latex";
import IsiSoal from "@/lib/isi-soal";
import { jawabanRingkas } from "@/lib/answer-format";
import { gradeEssayAnswer } from "./actions";
import { LABEL_KEJADIAN, type JenisKejadian } from "@/lib/kejadian";

interface AnswerRow {
  id: string;
  response: unknown;
  auto_score: number | null;
  manual_score: number | null;
  needs_manual_grading: boolean;
  questions: Question;
}

export default async function AttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .single();
  if (!attempt) notFound();

  const { data: answers } = await supabase
    .from("answers")
    .select("id, response, auto_score, manual_score, needs_manual_grading, questions(*)")
    .eq("attempt_id", attemptId);

  // Catatan kejadian selama ujian (migrasi Tera 223); kosong bila tabelnya belum ada.
  const { data: kejadianMentah } = await supabase
    .from("attempt_events")
    .select("id, kind, durasi_ms, created_at")
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: true });
  const kejadian = (kejadianMentah ?? []) as { id: string; kind: JenisKejadian; durasi_ms: number | null; created_at: string }[];
  const jumlahKeluar = kejadian.filter((k) => k.kind === "hilang_fokus").length;

  const typedAttempt = attempt as Attempt;
  const typedAnswers = (answers ?? []) as unknown as AnswerRow[];

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/quizzes/${id}/results`} className="text-sm text-gray-500 underline">
        ← Kembali ke Hasil
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">{typedAttempt.guest_name}</h1>
      <p className="text-sm text-gray-500">
        Skor total: {typedAttempt.total_score === null ? "Menunggu penilaian" : typedAttempt.total_score}
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-500">Catatan selama ujian</h2>
        {kejadian.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Tidak ada kejadian yang tercatat.</p>
        ) : (
          <>
            <p className={`mt-2 text-sm font-medium ${jumlahKeluar >= 3 ? "text-red-600" : "text-amber-700"}`}>
              Meninggalkan halaman ujian {jumlahKeluar} kali
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-gray-700">
              {kejadian.map((k) => (
                <li key={k.id} className="flex gap-3">
                  <span className="w-20 shrink-0 tabular-nums text-gray-400">
                    {new Date(k.created_at).toLocaleTimeString("id-ID")}
                  </span>
                  <span>
                    {LABEL_KEJADIAN[k.kind] ?? k.kind}
                    {k.kind === "kembali" && k.durasi_ms !== null && ` (pergi ${Math.round(k.durasi_ms / 1000)} dtk)`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              Catatan ini hanya sebagai bahan pertimbangan. Di ponsel, notifikasi atau panggilan masuk juga terbaca sebagai keluar halaman.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {typedAnswers.map((answer) => {
          const boundGrade = gradeEssayAnswer.bind(null, id, attemptId, answer.id);
          return (
            <div key={answer.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <IsiSoal text={answer.questions.prompt} className="font-medium" />
              <p className="mt-1 text-sm text-gray-600">
                Jawaban:{" "}
                <span className="font-medium">
                  <MathText text={jawabanRingkas(answer.questions, answer.response).replace(/\[gambar:[^\]]*\]/g, "(gambar pilihan)")} />
                </span>
              </p>

              {answer.needs_manual_grading ? (
                <form action={boundGrade} className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-gray-500">
                    Nilai (maks {answer.questions.weight})
                  </label>
                  <input
                    name="manual_score"
                    type="number"
                    min={0}
                    max={answer.questions.weight}
                    step="any"
                    defaultValue={answer.manual_score ?? ""}
                    required
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                  >
                    Simpan Nilai
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm">
                  Nilai otomatis: <span className="font-medium">{answer.auto_score}</span> /{" "}
                  {answer.questions.weight}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
