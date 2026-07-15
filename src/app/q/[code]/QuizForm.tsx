"use client";

import { useState } from "react";
import type { MatchingOptions, McqOptions, OrderingOptions, Question } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { startAttempt, saveAnswer, finalizeAttempt } from "./actions";

interface Student {
  id: string;
  name: string;
}

export default function QuizForm({
  quizId,
  shareCode,
  questions,
  students,
}: {
  quizId: string;
  shareCode: string;
  questions: Question[];
  students: Student[];
}) {
  const [step, setStep] = useState<"name" | "quiz" | "submitting">("name");
  const [guestName, setGuestName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
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

  if (step === "name") {
    return (
      <div className="flex flex-col gap-4">
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {students.length > 0 ? (
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
          Mulai Kuis
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
          index={index}
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

function QuestionInput({
  question,
  index,
  value,
  onChange,
}: {
  question: Question;
  index: number;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <fieldset className="rounded border border-gray-200 p-4">
      <legend className="px-1 text-sm font-medium">
        {index + 1}. {question.prompt}
      </legend>

      {question.type === "mcq_single" && (
        <div className="mt-2 flex flex-col gap-2">
          {(question.options as McqOptions | null)?.choices?.map((choice) => (
            <label key={choice} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`q_${question.id}`}
                checked={value === choice}
                onChange={() => onChange(choice)}
              />
              {choice}
            </label>
          ))}
        </div>
      )}

      {question.type === "mcq_multi" && (
        <div className="mt-2 flex flex-col gap-2">
          {(question.options as McqOptions | null)?.choices?.map((choice) => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label key={choice} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(choice)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, choice]
                        : selected.filter((c) => c !== choice),
                    )
                  }
                />
                {choice}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "true_false" && (
        <div className="mt-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={`q_${question.id}`} checked={value === "true"} onChange={() => onChange("true")} />
            Benar
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`q_${question.id}`} checked={value === "false"} onChange={() => onChange("false")} />
            Salah
          </label>
        </div>
      )}

      {question.type === "short_answer" && (
        <input
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(e) => onChange(e.target.value)}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Jawaban singkat"
        />
      )}

      {question.type === "essay" && (
        <textarea
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(e) => onChange(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Tulis jawabanmu"
        />
      )}

      {question.type === "matching" && (
        <MatchingInput question={question} value={value} onChange={onChange} />
      )}

      {question.type === "ordering" && (
        <OrderingInput question={question} value={value} onChange={onChange} />
      )}

      {question.type === "fill_blank" && (
        <FillBlankInput question={question} value={value} onChange={onChange} />
      )}

      {question.type === "upload_file" && (
        <UploadFileInput value={value} onChange={onChange} />
      )}
    </fieldset>
  );
}

function MatchingInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const pairs = (question.options as MatchingOptions | null)?.pairs ?? [];
  const [rightChoices] = useState(() => [...pairs].map((p) => p.right).sort(() => Math.random() - 0.5));
  const mapping = (value as Record<string, string>) ?? {};

  return (
    <div className="mt-2 flex flex-col gap-2">
      {pairs.map((pair) => (
        <div key={pair.left} className="flex items-center gap-2 text-sm">
          <span className="flex-1">{pair.left}</span>
          <select
            value={mapping[pair.left] ?? ""}
            onChange={(e) => onChange({ ...mapping, [pair.left]: e.target.value })}
            className="flex-1 rounded border border-gray-300 px-2 py-1"
          >
            <option value="">— pilih —</option>
            {rightChoices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = (question.options as OrderingOptions | null)?.items ?? [];
  const [order, setOrder] = useState<string[]>(() => {
    if (Array.isArray(value)) return value as string[];
    return [...items].sort(() => Math.random() - 0.5);
  });

  function move(i: number, dir: -1 | 1) {
    const next = [...order];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    setOrder(next);
    onChange(next);
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      {order.map((item, i) => (
        <div key={item} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 text-sm">
          <span className="flex-1">
            {i + 1}. {item}
          </span>
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-xs disabled:opacity-30">
            ▲
          </button>
          <button
            type="button"
            disabled={i === order.length - 1}
            onClick={() => move(i, 1)}
            className="text-xs disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      ))}
    </div>
  );
}

function FillBlankInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const parts = question.prompt.split("___");
  const blanks = Array.isArray(value) ? (value as string[]) : Array(Math.max(parts.length - 1, 0)).fill("");

  function setBlank(i: number, text: string) {
    const next = [...blanks];
    next[i] = text;
    onChange(next);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {part}
          {i < parts.length - 1 && (
            <input
              defaultValue={blanks[i] ?? ""}
              onBlur={(e) => setBlank(i, e.target.value)}
              className="w-32 rounded border border-gray-300 px-2 py-1"
            />
          )}
        </span>
      ))}
    </div>
  );
}

function UploadFileInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    const supabase = createClient();
    const path = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("quiz-uploads").upload(path, file);
    setUploading(false);
    if (error || !data) return;
    const { data: publicUrl } = supabase.storage.from("quiz-uploads").getPublicUrl(data.path);
    onChange(publicUrl.publicUrl);
  }

  return (
    <div className="mt-2 text-sm">
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="text-sm"
      />
      {uploading && <p className="text-gray-500">Mengunggah…</p>}
      {typeof value === "string" && value && (
        <p className="mt-1 text-green-700">Sudah diunggah ✓</p>
      )}
    </div>
  );
}
