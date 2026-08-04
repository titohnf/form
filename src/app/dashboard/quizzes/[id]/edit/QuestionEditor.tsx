"use client";

import { useState } from "react";
import type {
  Branching,
  MatchingOptions,
  McqOptions,
  OrderingOptions,
  Question,
  QuestionType,
} from "@/lib/types";
import { BRANCH_END } from "@/lib/types";
import MathField from "@/lib/MathField";
import { updateQuestion, deleteQuestion, moveQuestion, saveToBank } from "./actions";

const typeLabel: Record<QuestionType, string> = {
  mcq_single: "Pilihan Ganda (satu jawaban)",
  mcq_multi: "Pilihan Ganda (banyak jawaban / checkbox)",
  true_false: "Benar / Salah",
  short_answer: "Isian Singkat",
  essay: "Esai",
  matching: "Menjodohkan",
  ordering: "Mengurutkan",
  fill_blank: "Mengisi Bagian Kosong",
  upload_file: "Upload Gambar/File",
};

export default function QuestionEditor({
  quizId,
  question,
  index,
  total,
  sequentialMode,
  otherQuestions,
}: {
  quizId: string;
  question: Question;
  index: number;
  total: number;
  sequentialMode: boolean;
  otherQuestions: Pick<Question, "id" | "prompt">[];
}) {
  const [type, setType] = useState<QuestionType>(question.type);
  const [branching, setBranching] = useState<Branching>(question.branching ?? {});
  const boundUpdate = updateQuestion.bind(null, quizId, question.id);
  const boundSaveToBank = saveToBank.bind(null, question.id);

  const mcqOptions = question.options as McqOptions | null;
  const matchingOptions = question.options as MatchingOptions | null;
  const orderingOptions = question.options as OrderingOptions | null;
  const branchChoices =
    type === "true_false" ? ["true", "false"] : type === "mcq_single" ? mcqOptions?.choices ?? [] : [];

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
            onClick={() => boundSaveToBank()}
            className="text-xs text-gray-500 hover:underline"
          >
            Simpan ke Bank
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
          <MathField
            name="prompt"
            defaultValue={question.prompt}
            required
            rows={2}
            hint={
              type === "fill_blank" ? (
                <span className="text-xs text-gray-400">
                  Tandai bagian kosong dengan tiga garis bawah, contoh: Ibukota Indonesia adalah ___.
                </span>
              ) : undefined
            }
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
              <MathField name="choices" rows={3} defaultValue={mcqOptions?.choices?.join("\n") ?? ""} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Jawaban benar (harus sama persis dengan salah satu pilihan)
              <MathField
                name="mcq_correct"
                defaultValue={typeof question.correct_answer === "string" ? question.correct_answer : ""}
              />
            </label>
          </div>
        )}

        {type === "mcq_multi" && (
          <div className="flex flex-col gap-2 rounded bg-gray-50 p-3">
            <label className="flex flex-col gap-1 text-sm">
              Pilihan jawaban (satu per baris)
              <MathField name="choices" rows={3} defaultValue={mcqOptions?.choices?.join("\n") ?? ""} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Jawaban benar (satu per baris, harus sama persis dengan pilihan di atas)
              <MathField
                name="mcq_multi_correct"
                rows={2}
                defaultValue={
                  Array.isArray(question.correct_answer) ? question.correct_answer.join("\n") : ""
                }
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
            <MathField
              name="short_answer_keys"
              defaultValue={
                Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : ""
              }
            />
          </label>
        )}

        {type === "matching" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Pasangan (format: Kiri = Kanan, satu per baris)
            <MathField
              name="matching_pairs"
              rows={4}
              placeholder={"Ibukota Indonesia = Jakarta\nIbukota Malaysia = Kuala Lumpur"}
              defaultValue={
                matchingOptions?.pairs?.map((p) => `${p.left} = ${p.right}`).join("\n") ?? ""
              }
            />
          </label>
        )}

        {type === "ordering" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Urutan yang benar (satu item per baris, dari atas ke bawah)
            <MathField
              name="ordering_items"
              rows={4}
              defaultValue={orderingOptions?.items?.join("\n") ?? ""}
            />
          </label>
        )}

        {type === "fill_blank" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Jawaban tiap bagian kosong (satu per baris, urut sesuai posisi ___ di pertanyaan)
            <MathField
              name="fill_blank_answers"
              rows={3}
              defaultValue={
                Array.isArray(question.correct_answer) ? question.correct_answer.join("\n") : ""
              }
            />
          </label>
        )}

        {type === "essay" && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">
            Esai dinilai manual oleh tutor setelah murid submit.
          </p>
        )}

        {type === "upload_file" && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">
            Murid mengunggah gambar/file sebagai jawaban; dinilai manual oleh tutor.
          </p>
        )}

        {sequentialMode && branchChoices.length > 0 && (
          <div className="flex flex-col gap-2 rounded bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-900">Percabangan (mode satu soal per halaman)</p>
            {branchChoices.map((choice) => (
              <label key={choice} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate">{choice === "true" ? "Benar" : choice === "false" ? "Salah" : choice}</span>
                <select
                  value={branching[choice] ?? ""}
                  onChange={(e) => setBranching((prev) => ({ ...prev, [choice]: e.target.value }))}
                  className="flex-1 rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">Lanjut otomatis (soal berikutnya)</option>
                  <option value={BRANCH_END}>Selesaikan kuis</option>
                  {otherQuestions
                    .filter((q) => q.id !== question.id)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        → {q.prompt.slice(0, 50)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <input type="hidden" name="branching_json" value={JSON.stringify(branching)} />
          </div>
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
