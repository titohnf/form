"use client";

import { useState } from "react";
import type { MasteryBand, Question } from "@/lib/types";
import QuestionInput from "@/lib/QuestionInput";
import { MathText } from "@/lib/latex";
import { masteryLabel, percentOf } from "@/lib/mastery";
import {
  loadTopics,
  loadRubric,
  startSession,
  submitAnswer,
  finishSession,
  type AnswerResult,
  type PracticeQuestion,
  type PracticeSubject,
  type PracticeTopic,
  type TopicScore,
} from "./actions";

const COUNT_CHOICES = [5, 10, 20];
const DEFAULT_COUNT = 10;

type Stage =
  | { name: "subject" }
  | { name: "pick"; subject: PracticeSubject; topics: PracticeTopic[] }
  | { name: "running"; sessionId: string; questions: PracticeQuestion[] }
  | { name: "done"; summary: TopicScore[] };

/**
 * The whole practice flow: pick a subject, then its curriculum topics, answer
 * one question at a time with instant feedback, then see the per-topic
 * breakdown. Grading happens in the server action, so the answer key never
 * reaches this component.
 */
export default function PracticeRunner({ subjects }: { subjects: PracticeSubject[] }) {
  const [stage, setStage] = useState<Stage>({ name: "subject" });
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [rubric, setRubric] = useState<MasteryBand[] | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<unknown>(undefined);
  const [result, setResult] = useState<AnswerResult | null>(null);

  async function chooseSubject(subject: PracticeSubject) {
    setBusy(true);
    setError(null);
    // The rubric is fetched alongside the topics so the summary can label scores
    // without another round trip once the session ends.
    const [topics, bands] = await Promise.all([
      loadTopics(subject.subject_id),
      loadRubric(subject.subject_id),
    ]);
    setBusy(false);
    setRubric(bands);
    setSubjectId(subject.subject_id);
    setSelected([]);
    setStage({ name: "pick", subject, topics });
  }

  async function handleStart() {
    if (!subjectId) return;
    setBusy(true);
    setError(null);
    const started = await startSession(subjectId, selected, count);
    setBusy(false);

    if ("error" in started) {
      setError(started.error);
      return;
    }
    setIndex(0);
    setResponse(undefined);
    setResult(null);
    setStage({ name: "running", sessionId: started.sessionId, questions: started.questions });
  }

  async function handleCheck() {
    if (stage.name !== "running") return;
    setBusy(true);
    const answered = await submitAnswer(
      stage.sessionId,
      stage.questions[index].id,
      response ?? null,
    );
    setBusy(false);
    setResult(answered);
  }

  async function handleNext() {
    if (stage.name !== "running") return;

    if (index + 1 < stage.questions.length) {
      setIndex(index + 1);
      setResponse(undefined);
      setResult(null);
      return;
    }

    setBusy(true);
    const summary = await finishSession(stage.sessionId);
    setBusy(false);
    setStage({ name: "done", summary });
  }

  if (stage.name === "subject") {
    if (subjects.length === 0) {
      return (
        <p className="rounded bg-yellow-50 p-3 text-sm text-yellow-800">
          Belum ada soal yang siap dilatih. Hubungi tutormu.
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-500">Mau latihan mapel apa?</p>
        {subjects.map((subject) => (
          <button
            key={subject.subject_id}
            type="button"
            disabled={busy}
            onClick={() => chooseSubject(subject)}
            className="flex items-center justify-between rounded border border-gray-200 p-4 text-left hover:border-gray-400 disabled:opacity-50"
          >
            <span className="font-medium">{subject.subject_name}</span>
            <span className="text-xs text-gray-400">{subject.question_count} soal</span>
          </button>
        ))}
      </div>
    );
  }

  if (stage.name === "pick") {
    const available = stage.topics.filter((t) => t.question_count > 0);

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStage({ name: "subject" })}
          className="self-start text-sm text-gray-500 underline"
        >
          ← Ganti mapel
        </button>

        <p className="text-sm text-gray-500">
          {stage.subject.subject_name} — pilih topik yang mau dilatih. Kalau tidak memilih apa pun,
          soal diambil dari semua topik mapel ini.
        </p>

        <div className="flex flex-col gap-2 rounded border border-gray-200 p-4">
          {available.length === 0 && (
            <p className="text-sm text-gray-500">Belum ada topik bersoal di mapel ini.</p>
          )}
          {available.map((topic) => {
            const checked = selected.includes(topic.group_id);
            return (
              <label key={topic.group_id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelected(
                      checked
                        ? selected.filter((id) => id !== topic.group_id)
                        : [...selected, topic.group_id],
                    )
                  }
                  className="mt-1"
                />
                <span>
                  {topic.topic}
                  {/* Jenjang dan semester sengaja tidak ditampilkan: murid sudah
                      memilih mapelnya, dan untuk kurikulum seperti TKA yang tidak
                      mengenal semester, angkanya hanya kebisingan. */}
                  <span className="ml-2 text-xs text-gray-400">
                    {topic.theme ? `${topic.theme} · ` : ""}
                    {topic.question_count} soal
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm">
          Jumlah soal
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {COUNT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={handleStart}
          className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Menyiapkan…" : "Mulai Latihan"}
        </button>
      </div>
    );
  }

  if (stage.name === "running") {
    const current = stage.questions[index];
    // The runner never has an answer key, so a bank item is enough to render.
    const asQuestion: Question = {
      id: current.id,
      quiz_id: "",
      type: current.type,
      prompt: current.prompt,
      options: current.options,
      correct_answer: null,
      weight: current.weight,
      order_index: index,
      branching: null,
      explanation: null,
      stimulus_images: current.stimulus_images ?? [],
    };

    return (
      <div className="flex flex-col gap-4">
        <div className="h-1 rounded bg-gray-100">
          <div
            className="h-1 rounded bg-black transition-all"
            style={{ width: `${((index + (result ? 1 : 0)) / stage.questions.length) * 100}%` }}
          />
        </div>

        <QuestionInput
          question={asQuestion}
          label={`Soal ${index + 1} dari ${stage.questions.length}`}
          value={response}
          onChange={setResponse}
        />

        {result ? (
          <>
            <div
              className={`rounded p-3 text-sm ${
                result.isCorrect ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}
            >
              <p className="font-medium">
                {result.isCorrect
                  ? "Benar ✓"
                  : result.score > 0
                    ? `Sebagian benar — ${result.score} dari ${result.maxScore}`
                    : "Belum tepat"}
              </p>
              {result.explanation && (
                <div className="mt-2 leading-relaxed">
                  <MathText text={result.explanation} />
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleNext}
              className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {index + 1 < stage.questions.length ? "Lanjut →" : "Selesai & Lihat Hasil"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy || response === undefined}
            onClick={handleCheck}
            className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Memeriksa…" : "Periksa Jawaban"}
          </button>
        )}
      </div>
    );
  }

  return (
    <Summary
      summary={stage.summary}
      rubric={rubric}
      onRestart={() => setStage({ name: "subject" })}
    />
  );
}

function Summary({
  summary,
  rubric,
  onRestart,
}: {
  summary: TopicScore[];
  rubric: MasteryBand[] | null;
  onRestart: () => void;
}) {
  const totalScore = summary.reduce((sum, row) => sum + Number(row.score), 0);
  const totalMax = summary.reduce((sum, row) => sum + Number(row.max_score), 0);
  const overall = percentOf(totalScore, totalMax);
  const overallLabel = masteryLabel(rubric, overall);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Hasil latihan</p>
        <p className="text-3xl font-semibold">{overall}%</p>
        {overallLabel && <p className="text-sm font-medium text-gray-700">{overallLabel}</p>}
      </div>

      {summary.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada rincian topik untuk sesi ini.</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 rounded border border-gray-200">
          {summary.map((row) => {
            const percent = percentOf(Number(row.score), Number(row.max_score));
            const label = masteryLabel(rubric, percent);
            return (
              <div key={row.group_id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{row.topic}</p>
                  {row.theme && <p className="text-xs text-gray-400">{row.theme}</p>}
                  <p className="text-xs text-gray-400">{row.answered} soal</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{percent}%</p>
                  {label && <p className="text-xs text-gray-500">{label}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="rounded border border-gray-300 px-4 py-3 text-sm font-medium hover:bg-gray-50"
      >
        Latihan Lagi
      </button>
    </div>
  );
}
