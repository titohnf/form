"use client";

import { useState } from "react";
import type { Question, QuestionType } from "@/lib/types";
import { updateQuestion, deleteQuestion, moveQuestion } from "./actions";

const typeLabel: Record<QuestionType, string> = {
  mcq_single: "Pilihan Ganda",
  true_false: "Benar / Salah",
  short_answer: "Isian Singkat",
  essay: "Esai",
};

export default function QuestionEditor({
  quizId,
  question,
  index,
  total,
}: {
  quizId: string;
  question: Question;
  index: number;
  total: number;
}) {
  const [type, setType] = useState<QuestionType>(question.type);
  const boundUpdate = updateQuestion.bind(null, quizId, question.id);

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Soal {index + 1}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => moveQuestion(quizId, question.id, "up")}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => moveQuestion(quizId, question.id, "down")}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={() => deleteQuestion(quizId, question.id)}
            className="text-xs text-red-500 hover:underline"
          >
            Hapus
          </button>
        </div>
      </div>

      <form action={boundUpdate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Pertanyaan
          <textarea
            name="prompt"
            defaultValue={question.prompt}
            required
            rows={2}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Tipe Soal
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              {Object.entries(typeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-24 flex-col gap-1 text-sm">
            Bobot
            <input
              name="weight"
              type="number"
              min={1}
              step={1}
              defaultValue={question.weight}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        {type === "mcq_single" && (
          <div className="flex flex-col gap-2 rounded bg-gray-50 p-3">
            <label className="flex flex-col gap-1 text-sm">
              Pilihan jawaban (satu per baris)
              <textarea
                name="choices"
                rows={3}
                defaultValue={question.options?.choices?.join("\n") ?? ""}
                className="rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Jawaban benar (harus sama persis dengan salah satu pilihan)
              <input
                name="mcq_correct"
                defaultValue={typeof question.correct_answer === "string" ? question.correct_answer : ""}
                className="rounded border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
        )}

        {type === "true_false" && (
          <div className="rounded bg-gray-50 p-3 text-sm">
            Jawaban benar
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="tf_correct"
                  value="true"
                  defaultChecked={question.correct_answer !== "false"}
                />
                Benar
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="tf_correct"
                  value="false"
                  defaultChecked={question.correct_answer === "false"}
                />
                Salah
              </label>
            </div>
          </div>
        )}

        {type === "short_answer" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Kunci jawaban (pisahkan dengan koma jika ada beberapa variasi)
            <input
              name="short_answer_keys"
              defaultValue={
                Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : ""
              }
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
        )}

        {type === "essay" && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">
            Esai dinilai manual oleh tutor setelah murid submit.
          </p>
        )}

        <button
          type="submit"
          className="self-start rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
        >
          Simpan Soal
        </button>
      </form>
    </div>
  );
}
