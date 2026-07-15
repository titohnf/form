"use client";

import type { Question } from "@/lib/types";

export default function QuizForm({
  questions,
  action,
}: {
  questions: Question[];
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm">
        Nama kamu
        <input
          name="guest_name"
          required
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="Tulis nama lengkap"
        />
      </label>

      {questions.map((question, index) => (
        <fieldset key={question.id} className="rounded border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium">
            {index + 1}. {question.prompt}
          </legend>

          {question.type === "mcq_single" && (
            <div className="mt-2 flex flex-col gap-2">
              {question.options?.choices?.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`q_${question.id}`} value={choice} required />
                  {choice}
                </label>
              ))}
            </div>
          )}

          {question.type === "true_false" && (
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name={`q_${question.id}`} value="true" required />
                Benar
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`q_${question.id}`} value="false" required />
                Salah
              </label>
            </div>
          )}

          {question.type === "short_answer" && (
            <input
              name={`q_${question.id}`}
              required
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Jawaban singkat"
            />
          )}

          {question.type === "essay" && (
            <textarea
              name={`q_${question.id}`}
              required
              rows={4}
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Tulis jawabanmu"
            />
          )}
        </fieldset>
      ))}

      <button
        type="submit"
        className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800"
      >
        Kirim Jawaban
      </button>
    </form>
  );
}
