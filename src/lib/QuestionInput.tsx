"use client";

import { useState } from "react";
import type {
  MatchingOptions,
  McqOptions,
  OrderingOptions,
  Question,
  StatementGridOptions,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { MathText } from "@/lib/latex";
import Stimulus from "@/lib/Stimulus";

/**
 * Renders the answer widget for any question type. Shared by the quiz page and
 * by practice mode so a question behaves identically wherever a student meets
 * it — the two flows differ in when answers are submitted, not in how they are
 * entered.
 */
export default function QuestionInput({
  question,
  label,
  value,
  onChange,
}: {
  question: Question;
  /** Heading for this question, e.g. "Soal 3" or "Soal 3 dari 10". */
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <fieldset className="rounded border border-gray-200 p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <Stimulus images={question.stimulus_images} />
      {question.type !== "fill_blank" && (
        <p className="text-sm font-medium">
          <MathText text={question.prompt} />
        </p>
      )}

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
              <MathText text={choice} />
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
                <MathText text={choice} />
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

      {question.type === "statement_grid" && (
        <StatementGridInput question={question} value={value} onChange={onChange} />
      )}
    </fieldset>
  );
}

/**
 * One two-way choice per statement. The response is an array of booleans aligned
 * by index with `options.statements`, with null for the rows left unanswered —
 * the same shape the answer key uses, so grading is a positional comparison.
 */
function StatementGridInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = question.options as StatementGridOptions | null;
  const statements = options?.statements ?? [];
  const [trueLabel, falseLabel] = options?.answer_labels ?? ["Benar", "Salah"];
  const answers = Array.isArray(value) ? (value as (boolean | null)[]) : [];

  function setAt(i: number, answer: boolean) {
    const next = statements.map((_, j) => answers[j] ?? null);
    next[i] = answer;
    onChange(next);
  }

  return (
    <div className="mt-2 flex flex-col divide-y divide-gray-100">
      {statements.map((statement, i) => (
        <div key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="flex-1 text-sm">
            <MathText text={statement} />
          </span>
          <div className="flex shrink-0 gap-4 text-sm">
            {([true, false] as const).map((answer) => (
              <label key={String(answer)} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`q_${question.id}_s_${i}`}
                  checked={answers[i] === answer}
                  onChange={() => setAt(i, answer)}
                />
                {answer ? trueLabel : falseLabel}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
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
          <span className="flex-1">
            <MathText text={pair.left} />
          </span>
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
            {i + 1}. <MathText text={item} />
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
          <MathText text={part} />
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
