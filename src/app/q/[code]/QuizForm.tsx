"use client";

import { useEffect, useMemo, useState } from "react";
import type { Branching, Question } from "@/lib/types";
import { BRANCH_END } from "@/lib/types";
import QuestionInput from "@/lib/QuestionInput";
import TampilanCbt, { type KondisiCbt } from "./TampilanCbt";
import MasukCbt from "./MasukCbt";
import { startAttempt, startAssessmentAttempt, saveAnswer, finalizeAttempt, catatKejadian } from "./actions";
import { susunUntukPeserta } from "@/lib/acak";

interface Student {
  id: string;
  name: string;
}

function resolveNext(
  question: Question,
  response: unknown,
  questions: Question[],
): string | null {
  const branching = question.branching as Branching | null;
  const target = branching?.[String(response)];
  if (target === BRANCH_END) return null;
  if (target) return target;

  const currentIndex = questions.findIndex((q) => q.id === question.id);
  const next = questions[currentIndex + 1];
  return next ? next.id : null;
}

export default function QuizForm({
  quizId,
  shareCode,
  questions,
  students,
  sequential,
  cbt,
  acakSoal,
  acakPilihan,
  timeLimitMinutes,
  judul,
  kode,
  paket,
  assessment,
}: {
  quizId: string;
  shareCode: string;
  questions: Question[];
  students: Student[];
  sequential: boolean;
  /** Tampilan ala TKA: satu soal per layar, timer, daftar soal. */
  cbt: boolean;
  /** Acak urutan soal / pilihan per peserta (hanya tampilan TKA; stabil per percobaan). */
  acakSoal: boolean;
  acakPilihan: boolean;
  timeLimitMinutes: number | null;
  /** Judul paket, ditampilkan di bilah atas tampilan TKA. */
  judul: string;
  /** Kode bagikan paket ini, dan daftar paket try out TKA yang bisa dipilih di halaman masuk. */
  kode: string;
  paket: { kode: string; judul: string }[];
  /**
   * Nama murid yang sedang login, kalau kode ini sebuah penugasan asesmen.
   * Identitasnya sudah pasti dari sesi login, jadi langkah isi nama / pilih
   * roster dilewati sama sekali.
   */
  assessment: { studentName: string } | null;
}) {
  const [step, setStep] = useState<"name" | "quiz" | "submitting">("name");
  const [guestName, setGuestName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(questions[0]?.id ?? null);
  const [visited, setVisited] = useState(1);
  // Hanya dipakai tampilan TKA. `skew` = jam server dikurangi jam perangkat.
  const [mulaiMs, setMulaiMs] = useState<number | null>(null);
  const [skew, setSkew] = useState(0);
  // Urutan yang diacak per peserta, dengan benih id percobaannya.
  const soalCbt = useMemo(
    () => (cbt && attemptId ? susunUntukPeserta(questions, attemptId, acakSoal, acakPilihan) : questions),
    [cbt, attemptId, questions, acakSoal, acakPilihan],
  );
  const [kondisi, setKondisi] = useState<KondisiCbt>({ nomor: 0, ragu: [] });

  // Kalau halaman dimuat ulang di tengah ujian (tab tertutup, HP kehabisan
  // memori), murid melanjutkan percobaan yang sama dengan waktu yang tetap
  // berjalan, bukan memulai ulang dengan waktu penuh.
  const kunciSimpan = `cbt:${shareCode}`;
  useEffect(() => {
    if (!cbt) return;
    try {
      const raw = localStorage.getItem(kunciSimpan);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        attemptId: string;
        mulaiMs: number;
        skew: number;
        responses: Record<string, unknown>;
        kondisi: KondisiCbt;
        nama?: string;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- memulihkan dari penyimpanan perangkat, hanya bisa setelah mount
      setAttemptId(d.attemptId);
      setMulaiMs(d.mulaiMs);
      setSkew(d.skew);
      setResponses(d.responses ?? {});
      setKondisi(d.kondisi ?? { nomor: 0, ragu: [] });
      if (d.nama) setGuestName(d.nama);
      setStep("quiz");
    } catch {
      /* penyimpanan tidak tersedia atau rusak: mulai dari awal */
    }
  }, [cbt, kunciSimpan]);

  function simpanCbt(patch: Record<string, unknown>) {
    try {
      const lama = JSON.parse(localStorage.getItem(kunciSimpan) ?? "{}");
      localStorage.setItem(kunciSimpan, JSON.stringify({ ...lama, ...patch }));
    } catch {
      /* tanpa penyimpanan, pemulihan saja yang hilang */
    }
  }

  async function handleStart() {
    if (assessment) {
      setError(null);
      const result = await startAssessmentAttempt(shareCode);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAttemptId(result.attemptId);
      setStep("quiz");
      return;
    }

    const name = students.length > 0 ? students.find((s) => s.id === studentId)?.name ?? "" : guestName.trim();
    if (!name) {
      setError("Nama wajib diisi");
      return;
    }
    setError(null);
    const result = await startAttempt(shareCode, name, students.length > 0 ? studentId : null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAttemptId(result.attemptId);
    if (cbt) {
      simpanCbt({ nama: name });
      const mulai = result.startedAt ? Date.parse(result.startedAt) : Date.now();
      const selisih = result.serverNow ? Date.parse(result.serverNow) - Date.now() : 0;
      setMulaiMs(mulai);
      setSkew(selisih);
      simpanCbt({ attemptId: result.attemptId, mulaiMs: mulai, skew: selisih, responses: {}, kondisi: { nomor: 0, ragu: [] } });
    }
    setStep("quiz");
  }

  function handleAnswer(questionId: string, response: unknown, index: number) {
    setResponses((prev) => {
      const baru = { ...prev, [questionId]: response };
      if (cbt) simpanCbt({ responses: baru });
      return baru;
    });
    if (attemptId) {
      saveAnswer(quizId, attemptId, questionId, response, index).then((r) => {
        // Waktu sudah habis menurut server: kirim apa yang sudah tersimpan.
        if (r && "expired" in r) handleSubmit();
      });
    }
  }

  async function handleSubmit() {
    if (!attemptId || step === "submitting") return;
    setStep("submitting");
    if (cbt) {
      try {
        localStorage.removeItem(kunciSimpan);
      } catch {
        /* abaikan */
      }
      // Keluar dari layar penuh supaya halaman hasil tampil biasa.
      if (typeof document !== "undefined" && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    }
    await finalizeAttempt(shareCode, attemptId);
  }

  function handleNext(question: Question) {
    const nextId = resolveNext(question, responses[question.id], questions);
    if (nextId) {
      setCurrentId(nextId);
      setVisited((v) => v + 1);
    } else {
      handleSubmit();
    }
  }

  if (step === "name" && cbt) {
    return (
      <MasukCbt
        judul={judul}
        kode={kode}
        paket={paket}
        jumlahSoal={questions.length}
        menit={timeLimitMinutes}
        namaAsesmen={assessment?.studentName ?? null}
        students={students}
        studentId={studentId}
        onStudentId={setStudentId}
        guestName={guestName}
        onGuestName={setGuestName}
        error={error}
        onMulai={handleStart}
      />
    );
  }

  if (step === "name") {
    return (
      <div className="flex flex-col gap-4">
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {assessment ? (
          <p className="rounded bg-gray-50 p-3 text-sm">
            Masuk sebagai <span className="font-medium">{assessment.studentName}</span>
          </p>
        ) : students.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            Pilih namamu
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">— Pilih nama —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Nama kamu
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Tulis nama lengkap"
            />
          </label>
        )}
        {cbt && (
          <ul className="list-disc space-y-1 rounded bg-blue-50 p-3 pl-7 text-sm text-blue-900">
            <li>Jumlah soal: {questions.length}</li>
            {timeLimitMinutes && <li>Waktu mengerjakan: {timeLimitMinutes} menit, mulai berjalan setelah kamu menekan tombol di bawah.</li>}
            <li>Soal tampil satu per satu. Kamu bisa kembali ke soal sebelumnya dan menandai soal yang masih ragu-ragu.</li>
            <li>Tekan sebuah gambar untuk memperbesarnya. Ukuran huruf soal bisa diubah dengan tombol A di bagian atas.</li>
            <li>Jangan menutup atau memuat ulang halaman selama mengerjakan.</li>
          </ul>
        )}
        <button
          type="button"
          onClick={handleStart}
          className="self-start rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          {assessment ? "Mulai Asesmen" : "Mulai Mengerjakan"}
        </button>
      </div>
    );
  }

  if (cbt) {
    return (
      <TampilanCbt
        onKejadian={(jenis, durasi) => {
          if (attemptId) void catatKejadian(quizId, attemptId, jenis, durasi);
        }}
        judul={judul}
        nama={assessment?.studentName ?? (students.length > 0 ? students.find((s) => s.id === studentId)?.name : undefined) ?? guestName}
        questions={soalCbt}
        responses={responses}
        onAnswer={handleAnswer}
        onSubmit={handleSubmit}
        submitting={step === "submitting"}
        deadline={timeLimitMinutes && mulaiMs !== null ? mulaiMs + timeLimitMinutes * 60000 : null}
        skew={skew}
        kondisiAwal={kondisi}
        onKondisi={(k) => {
          setKondisi(k);
          simpanCbt({ kondisi: k });
        }}
      />
    );
  }

  if (sequential) {
    const question = questions.find((q) => q.id === currentId);
    if (!question) {
      return (
        <p className="rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Tidak ada soal untuk ditampilkan.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <p className="text-xs text-gray-400">Soal ke-{visited}</p>
        <QuestionInput
          question={question}
          label={`Soal ${visited}`}
          value={responses[question.id]}
          onChange={(value) => handleAnswer(question.id, value, questions.indexOf(question))}
        />
        <button
          type="button"
          disabled={step === "submitting"}
          onClick={() => handleNext(question)}
          className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {step === "submitting" ? "Mengirim…" : "Lanjut →"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {questions.map((question, index) => (
        <QuestionInput
          key={question.id}
          question={question}
          label={`Soal ${index + 1}`}
          value={responses[question.id]}
          onChange={(value) => handleAnswer(question.id, value, index)}
        />
      ))}

      <button
        type="button"
        disabled={step === "submitting"}
        onClick={handleSubmit}
        className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {step === "submitting" ? "Mengirim…" : "Kirim Jawaban"}
      </button>
    </div>
  );
}

