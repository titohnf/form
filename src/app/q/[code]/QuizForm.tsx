"use client";

import { useState } from "react";
import type { Branching, Question } from "@/lib/types";
import { BRANCH_END } from "@/lib/types";
import QuestionInput from "@/lib/QuestionInput";
import { startAttempt, startAssessmentAttempt, saveAnswer, finalizeAttempt } from "./actions";

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
  assessment,
}: {
  quizId: string;
  shareCode: string;
  questions: Question[];
  students: Student[];
  sequential: boolean;
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
    setStep("quiz");
  }

  function handleAnswer(questionId: string, response: unknown, index: number) {
    setResponses((prev) => ({ ...prev, [questionId]: response }));
    if (attemptId) {
      saveAnswer(quizId, attemptId, questionId, response, index);
    }
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setStep("submitting");
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

