import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Attempt, Question, Quiz } from "@/lib/types";
import { rankAttempts, computeBadges } from "@/lib/gamification";
import { perQuestionAccuracy } from "@/lib/question-stats";
import { MathText } from "@/lib/latex";
import { ringkasIsiSoal } from "@/lib/isi-soal-teks";
import RemedialBuilder from "./RemedialBuilder";
import PohonKompetensi from "./PohonKompetensi";
import {
  indikatorTerlemah,
  jumlahTanpaPeta,
  skorJawaban,
  susunPohon,
  type PetaKompetensi,
  type SoalAnalisis,
} from "@/lib/analisis-kompetensi";

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

  // Catatan kejadian selama ujian (migrasi Tera 223). Kalau tabelnya belum
  // ada, hasilnya kosong dan halaman ini tetap tampil seperti biasa.
  const { data: kejadianMentah } = await supabase
    .from("attempt_events")
    .select("attempt_id, kind, durasi_ms")
    .eq("quiz_id", id);
  const kejadian = new Map<string, { keluar: number; detik: number; lain: number }>();
  for (const k of (kejadianMentah ?? []) as { attempt_id: string; kind: string; durasi_ms: number | null }[]) {
    const r = kejadian.get(k.attempt_id) ?? { keluar: 0, detik: 0, lain: 0 };
    if (k.kind === "hilang_fokus") r.keluar += 1;
    else if (k.kind === "kembali") r.detik += Math.round((k.durasi_ms ?? 0) / 1000);
    else r.lain += 1;
    kejadian.set(k.attempt_id, r);
  }

  const typedQuestions = (questions ?? []) as Question[];
  const typedAnswers = (answers ?? []) as Answer[];
  const typedAttempts = (attempts as Attempt[] | null) ?? [];
  const totalWeight = typedQuestions.reduce((sum, q) => sum + Number(q.weight), 0);

  const perQuestionStats = perQuestionAccuracy(typedQuestions, typedAnswers, typedAttempts);

  const ranked = rankAttempts(typedAttempts);

  // Analisis menurut kompetensi (migrasi Tera 224). Soal yang belum dipetakan
  // tidak ikut pohonnya. Hanya percobaan yang sudah dikirim yang dihitung.
  const soalAnalisis: SoalAnalisis[] = typedQuestions.map((q) => ({
    id: q.id,
    nomor: q.order_index + 1,
    bobot: Number(q.weight),
    kompetensi: (q as Question & { kompetensi?: PetaKompetensi | null }).kompetensi ?? null,
  }));
  const idDikirim = typedAttempts.filter((a) => a.submitted_at).map((a) => a.id);
  const dikirimSet = new Set(idDikirim);
  const pohonKompetensi = susunPohon(
    soalAnalisis,
    typedAnswers
      .filter((a) => dikirimSet.has(a.attempt_id))
      .map((a) => ({ attemptId: a.attempt_id, questionId: a.question_id, skor: skorJawaban(a.auto_score, a.manual_score) })),
    idDikirim,
  );
  const indikatorLemah = indikatorTerlemah(pohonKompetensi, 5);
  const tanpaPeta = jumlahTanpaPeta(soalAnalisis);
  const adaPeta = soalAnalisis.some((s) => s.kompetensi);

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

      {adaPeta && idDikirim.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-medium text-gray-500">Analisis Kompetensi</h2>
            <p className="mt-1 text-sm text-gray-500">
              Capaian {idDikirim.length} peserta per elemen, sub-elemen, kompetensi, dan indikator, seperti halaman daya
              serap Pusmendik. Bilah biru = capaian peserta kita, garis hitam = capaian nasional. Ketuk satu baris untuk
              membuka tingkat di bawahnya.
              {tanpaPeta > 0 && ` ${tanpaPeta} soal belum dipetakan dan tidak ikut dihitung.`}
            </p>
          </div>
          {indikatorLemah.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-gray-800">Indikator terlemah — rujukan soal try out berikutnya</p>
              <ol className="mt-2 flex flex-col gap-1.5">
                {indikatorLemah.map((t, i) => (
                  <li key={t.kunci} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 text-gray-700">
                      <span className="mr-2 text-gray-400">{i + 1}.</span>
                      {t.nama}
                      <span className="ml-2 text-xs text-gray-400">soal no. {t.nomorSoal.join(", ")}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <b>{t.persen === null ? "—" : `${t.persen.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}</b>
                      {t.nasional !== null && (
                        <span className="ml-2 text-xs text-gray-500">
                          nasional {t.nasional.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <PohonKompetensi pohon={pohonKompetensi} />
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
              {(() => {
                const r = kejadian.get(attempt.id);
                if (!r || (r.keluar === 0 && r.lain === 0)) return null;
                const menit = r.detik >= 60 ? `${Math.floor(r.detik / 60)} mnt ${r.detik % 60} dtk` : `${r.detik} dtk`;
                return (
                  <p className={`mt-0.5 text-xs font-medium ${r.keluar >= 3 ? "text-red-600" : "text-amber-700"}`}>
                    {r.keluar > 0 && `Keluar halaman ${r.keluar}× (total ${menit})`}
                    {r.keluar > 0 && r.lain > 0 && " · "}
                    {r.lain > 0 && `${r.lain} kejadian lain`}
                  </p>
                );
              })()}
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
