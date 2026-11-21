"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Answer, Attempt, Question } from "@/lib/types";
import { MathText } from "@/lib/latex";
import { ringkasIsiSoal } from "@/lib/isi-soal";
import { jawabanRingkas } from "@/lib/answer-format";
import { terjawab } from "@/lib/terjawab";
import { LABEL_KEJADIAN, type JenisKejadian } from "@/lib/kejadian";
import { saveTutorFeedback } from "./actions";

/** Tidak ada denyut selama ini berarti tab ditutup atau perangkatnya bermasalah. */
const IDLE_THRESHOLD_MS = 2 * 60 * 1000;
/** Seberapa sering catatan kejadian ditarik. */
const JEDA_TARIK_MS = 4000;
/** Keluar halaman sebanyak ini ditandai "perlu perhatian". */
const AMBANG_KELUAR = 3;

export interface KejadianBaris {
  id: string;
  attempt_id: string;
  kind: JenisKejadian;
  durasi_ms: number | null;
  created_at: string;
}

type Saring = "semua" | "mengerjakan" | "selesai" | "perhatian";

function format(detik: number): string {
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  const d = detik % 60;
  return [j, m, d].map((n) => String(n).padStart(2, "0")).join(":");
}

function lama(ms: number): string {
  const d = Math.max(0, Math.round(ms / 1000));
  if (d < 60) return `${d} dtk`;
  return `${Math.floor(d / 60)} mnt ${d % 60} dtk`;
}

// Zona waktu dikunci (WIB) supaya server dan browser menulis jam yang sama; kalau tidak, render awal berbeda dan React memberi peringatan hidrasi.
const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });

export default function LiveMonitor({
  quizId,
  questions,
  initialAttempts,
  initialAnswers,
  initialEvents,
  timeLimitMinutes,
  waktuServer,
}: {
  quizId: string;
  questions: Question[];
  initialAttempts: Attempt[];
  initialAnswers: Answer[];
  initialEvents: KejadianBaris[];
  /** Batas waktu paket bertampilan TKA, untuk menghitung sisa waktu; null bila tanpa batas. */
  timeLimitMinutes: number | null;
  /** Waktu saat halaman dirender di server (ms). Dipakai sebagai "sekarang" awal supaya render server dan browser sama. */
  waktuServer: number;
}) {
  const [attempts, setAttempts] = useState<Record<string, Attempt>>(() =>
    Object.fromEntries(initialAttempts.map((a) => [a.id, a])),
  );
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.id, a])),
  );
  const [events, setEvents] = useState<Record<string, KejadianBaris>>(() =>
    Object.fromEntries(initialEvents.map((e) => [e.id, e])),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(waktuServer);
  const [saring, setSaring] = useState<Saring>("semua");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-${quizId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attempts", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setAttempts((prev) => {
              const next = { ...prev };
              delete next[(payload.old as Attempt).id];
              return next;
            });
          } else {
            const row = payload.new as Attempt;
            setAttempts((prev) => ({ ...prev, [row.id]: row }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setAnswers((prev) => {
              const next = { ...prev };
              delete next[(payload.old as Answer).id];
              return next;
            });
          } else {
            const row = payload.new as Answer;
            setAnswers((prev) => ({ ...prev, [row.id]: row }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId]);

  // Catatan kejadian ditarik tiap beberapa detik (tanpa langganan realtime, jadi
  // tidak butuh migrasi tambahan). Hasilnya digabung per id: yang sudah ada tidak
  // hilang, dan layar tidak berkedip. Percobaan ikut ditarik sebagai cadangan
  // bila langganan realtime terputus.
  useEffect(() => {
    const supabase = createClient();
    let batal = false;
    const tarik = async () => {
      if (document.hidden) return;
      const [ev, at] = await Promise.all([
        supabase
          .from("attempt_events")
          .select("id, attempt_id, kind, durasi_ms, created_at")
          .eq("quiz_id", quizId)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("attempts").select("*").eq("quiz_id", quizId),
      ]);
      if (batal) return;
      if (ev.data) {
        setEvents((prev) => {
          const next = { ...prev };
          for (const e of ev.data as KejadianBaris[]) next[e.id] = e;
          return next;
        });
      }
      if (at.data) {
        setAttempts((prev) => {
          const next = { ...prev };
          for (const a of at.data as Attempt[]) next[a.id] = a;
          return next;
        });
      }
    };
    const id = setInterval(tarik, JEDA_TARIK_MS);
    return () => {
      batal = true;
      clearInterval(id);
    };
  }, [quizId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const answersByAttempt = useMemo(() => {
    const map: Record<string, Answer[]> = {};
    for (const answer of Object.values(answers)) {
      (map[answer.attempt_id] ??= []).push(answer);
    }
    return map;
  }, [answers]);

  const eventsByAttempt = useMemo(() => {
    const map: Record<string, KejadianBaris[]> = {};
    for (const e of Object.values(events)) (map[e.attempt_id] ??= []).push(e);
    for (const list of Object.values(map)) list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return map;
  }, [events]);

  // Ringkasan per peserta, dihitung ulang tiap detik (sisa waktu dan "idle" bergantung pada `now`).
  const baris = useMemo(() => {
    return Object.values(attempts).map((attempt) => {
      const selesai = Boolean(attempt.submitted_at);
      const ev = eventsByAttempt[attempt.id] ?? [];
      const keluar = ev.filter((e) => e.kind === "hilang_fokus").length;
      const totalPergiMs = ev.reduce((n, e) => n + (e.kind === "kembali" ? (e.durasi_ms ?? 0) : 0), 0);
      const lain = ev.filter((e) => e.kind !== "hilang_fokus" && e.kind !== "kembali").length;
      const terakhirPergi = [...ev].reverse().find((e) => e.kind === "hilang_fokus" || e.kind === "kembali");
      const diLuar = !selesai && terakhirPergi?.kind === "hilang_fokus";
      const idle = !selesai && now - new Date(attempt.last_active_at).getTime() > IDLE_THRESHOLD_MS;
      const dijawab = (answersByAttempt[attempt.id] ?? []).filter((a) => terjawab(a.response)).length;
      const sisaDetik =
        timeLimitMinutes && !selesai
          ? Math.max(0, Math.floor((new Date(attempt.started_at).getTime() + timeLimitMinutes * 60000 - now) / 1000))
          : null;
      const perhatian = keluar >= AMBANG_KELUAR || (!selesai && (diLuar || idle));
      return {
        attempt,
        selesai,
        keluar,
        totalPergiMs: diLuar && terakhirPergi ? totalPergiMs + (now - new Date(terakhirPergi.created_at).getTime()) : totalPergiMs,
        lain,
        diLuar,
        luarSejak: diLuar && terakhirPergi ? terakhirPergi.created_at : null,
        idle,
        dijawab,
        sisaDetik,
        perhatian,
        ev,
      };
    });
  }, [attempts, eventsByAttempt, answersByAttempt, now, timeLimitMinutes]);

  const ringkasan = useMemo(
    () => ({
      total: baris.length,
      mengerjakan: baris.filter((b) => !b.selesai).length,
      selesai: baris.filter((b) => b.selesai).length,
      diLuar: baris.filter((b) => b.diLuar).length,
      perhatian: baris.filter((b) => b.perhatian).length,
    }),
    [baris],
  );

  const tampil = useMemo(() => {
    const disaring = baris.filter((b) =>
      saring === "semua" ? true : saring === "mengerjakan" ? !b.selesai : saring === "selesai" ? b.selesai : b.perhatian,
    );
    // Yang perlu perhatian di atas, lalu yang masih mengerjakan, lalu yang baru dimulai.
    return [...disaring].sort(
      (a, b) =>
        Number(b.perhatian) - Number(a.perhatian) ||
        Number(a.selesai) - Number(b.selesai) ||
        (a.attempt.started_at < b.attempt.started_at ? 1 : -1),
    );
  }, [baris, saring]);

  const namaPeserta = useMemo(
    () => Object.fromEntries(Object.values(attempts).map((a) => [a.id, a.guest_name])),
    [attempts],
  );
  const aktivitas = useMemo(
    () =>
      Object.values(events)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 30),
    [events],
  );

  const kartu: { label: string; nilai: number; warna: string }[] = [
    { label: "Peserta", nilai: ringkasan.total, warna: "text-gray-900" },
    { label: "Sedang mengerjakan", nilai: ringkasan.mengerjakan, warna: "text-blue-700" },
    { label: "Selesai", nilai: ringkasan.selesai, warna: "text-green-700" },
    { label: "Sedang di luar halaman", nilai: ringkasan.diLuar, warna: ringkasan.diLuar > 0 ? "text-red-600" : "text-gray-500" },
    { label: "Perlu perhatian", nilai: ringkasan.perhatian, warna: ringkasan.perhatian > 0 ? "text-amber-600" : "text-gray-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kartu.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className={`text-2xl font-semibold tabular-nums ${k.warna}`}>{k.nilai}</p>
            <p className="text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["semua", "Semua"],
            ["mengerjakan", "Sedang mengerjakan"],
            ["selesai", "Selesai"],
            ["perhatian", "Perlu perhatian"],
          ] as [Saring, string][]
        ).map(([nilai, label]) => (
          <button
            key={nilai}
            type="button"
            onClick={() => setSaring(nilai)}
            className={`rounded-full border px-3 py-1 ${
              saring === nilai ? "border-blue-600 bg-blue-50 font-medium text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.4fr_1.5fr_0.9fr_1.1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-gray-500 md:grid">
            <span>Peserta</span>
            <span>Progres</span>
            <span>Sisa waktu</span>
            <span>Keluar halaman</span>
            <span>Status</span>
          </div>
          {tampil.length === 0 && (
            <p className="p-6 text-sm text-gray-500">
              {baris.length === 0 ? "Belum ada murid yang membuka paket soal ini." : "Tidak ada peserta pada penyaring ini."}
            </p>
          )}
          <div className="divide-y divide-slate-100">
            {tampil.map((b) => {
              const { attempt } = b;
              const persen = questions.length > 0 ? Math.round((b.dijawab / questions.length) * 100) : 0;
              const lencana = b.selesai
                ? { teks: attempt.total_score !== null ? `Selesai — ${attempt.total_score}` : "Selesai", kelas: "bg-green-100 text-green-700" }
                : b.diLuar
                  ? { teks: "Di luar halaman", kelas: "bg-red-100 text-red-700" }
                  : b.idle
                    ? { teks: "Tidak aktif", kelas: "bg-yellow-100 text-yellow-700" }
                    : { teks: "Mengerjakan", kelas: "bg-blue-100 text-blue-700" };
              return (
                <div key={attempt.id} className={b.perhatian ? "bg-amber-50/40" : ""}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === attempt.id ? null : attempt.id)}
                    className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 text-left hover:bg-gray-50 md:grid-cols-[1.4fr_1.5fr_0.9fr_1.1fr_1fr]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{attempt.guest_name}</p>
                      <p className="text-xs text-gray-500">
                        {b.selesai
                          ? `Dikirim ${jam(attempt.submitted_at as string)}`
                          : `Sedang di soal nomor ${attempt.current_question_index + 1}`}
                      </p>
                    </div>
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${persen}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Dijawab {b.dijawab} / {questions.length}
                      </p>
                    </div>
                    <p className={`text-sm tabular-nums ${b.sisaDetik !== null && b.sisaDetik <= 300 ? "font-medium text-red-600" : "text-gray-700"}`}>
                      {b.sisaDetik !== null ? format(b.sisaDetik) : "—"}
                    </p>
                    <div className="text-sm">
                      {b.keluar === 0 && b.lain === 0 ? (
                        <span className="text-gray-400">0×</span>
                      ) : (
                        <>
                          <span className={`font-medium ${b.keluar >= AMBANG_KELUAR ? "text-red-600" : "text-amber-700"}`}>
                            {b.keluar}×
                          </span>
                          {b.keluar > 0 && <span className="text-xs text-gray-500"> ({lama(b.totalPergiMs)})</span>}
                          {b.lain > 0 && <p className="text-xs text-red-600">{b.lain} kejadian lain</p>}
                        </>
                      )}
                    </div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${lencana.kelas}`}>{lencana.teks}</span>
                  </button>

                  {expanded === attempt.id && (
                    <div className="space-y-4 border-t border-gray-100 bg-white px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Catatan kejadian</p>
                        {b.ev.length === 0 ? (
                          <p className="mt-1 text-sm text-gray-500">Tidak ada kejadian yang tercatat.</p>
                        ) : (
                          <ul className="mt-1 flex flex-col gap-1 text-sm text-gray-700">
                            {b.ev.map((e) => (
                              <li key={e.id} className="flex gap-3">
                                <span className="w-20 shrink-0 tabular-nums text-gray-400">{jam(e.created_at)}</span>
                                <span>
                                  {LABEL_KEJADIAN[e.kind] ?? e.kind}
                                  {e.kind === "kembali" && e.durasi_ms !== null && ` (pergi ${lama(e.durasi_ms)})`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {b.luarSejak && (
                          <p className="mt-1 text-sm font-medium text-red-600">Sedang di luar halaman sejak {jam(b.luarSejak)}.</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        {questions.map((question) => {
                          const answer = (answersByAttempt[attempt.id] ?? []).find((a) => a.question_id === question.id);
                          return (
                            <div key={question.id} className="rounded bg-gray-50 p-3 text-sm">
                              <p className="font-medium">
                                <MathText text={ringkasIsiSoal(question.prompt)} />
                              </p>
                              <p className="mt-1 text-gray-600">
                                Jawaban:{" "}
                                {answer ? (
                                  <MathText text={jawabanRingkas(question, answer.response).replace(/\[gambar:[^\]]*\]/g, "(gambar pilihan)")} />
                                ) : (
                                  <em className="text-gray-400">belum dijawab</em>
                                )}
                              </p>
                              {answer && <FeedbackField answerId={answer.id} initial={answer.tutor_feedback ?? ""} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700">Aktivitas terbaru</p>
          {aktivitas.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Belum ada kejadian yang tercatat.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {aktivitas.map((e) => {
                const berat = e.kind !== "kembali";
                return (
                  <li key={e.id} className="flex gap-2 text-sm">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${berat ? "bg-red-500" : "bg-green-500"}`} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{namaPeserta[e.attempt_id] ?? "Peserta"}</p>
                      <p className="text-xs text-gray-600">
                        {LABEL_KEJADIAN[e.kind] ?? e.kind}
                        {e.kind === "kembali" && e.durasi_ms !== null && ` (pergi ${lama(e.durasi_ms)})`}
                      </p>
                      <p className="text-xs tabular-nums text-gray-400">{jam(e.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-gray-400">
            Hanya catatan, tidak mengubah nilai. Di ponsel, notifikasi atau panggilan masuk juga terbaca sebagai keluar halaman.
          </p>
        </aside>
      </div>
    </div>
  );
}

function FeedbackField({ answerId, initial }: { answerId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => saveTutorFeedback(answerId, value)}
      placeholder="Beri feedback ke murid…"
      rows={1}
      className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
    />
  );
}
