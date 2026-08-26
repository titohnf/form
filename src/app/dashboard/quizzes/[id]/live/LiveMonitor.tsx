"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Answer, Attempt, Question } from "@/lib/types";
import { MathText } from "@/lib/latex";
import { ringkasIsiSoal } from "@/lib/isi-soal";
import { jawabanRingkas } from "@/lib/answer-format";
import { saveTutorFeedback } from "./actions";

const IDLE_THRESHOLD_MS = 2 * 60 * 1000;

export default function LiveMonitor({
  quizId,
  questions,
  initialAttempts,
  initialAnswers,
}: {
  quizId: string;
  questions: Question[];
  initialAttempts: Attempt[];
  initialAnswers: Answer[];
}) {
  const [attempts, setAttempts] = useState<Record<string, Attempt>>(() =>
    Object.fromEntries(initialAttempts.map((a) => [a.id, a])),
  );
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.id, a])),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const attemptList = useMemo(
    () => Object.values(attempts).sort((a, b) => (a.started_at < b.started_at ? 1 : -1)),
    [attempts],
  );

  const answersByAttempt = useMemo(() => {
    const map: Record<string, Answer[]> = {};
    for (const answer of Object.values(answers)) {
      (map[answer.attempt_id] ??= []).push(answer);
    }
    return map;
  }, [answers]);

  return (
    <div className="flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
      {attemptList.length === 0 && (
        <p className="p-6 text-sm text-gray-500">Belum ada murid yang membuka paket soal ini.</p>
      )}
      {attemptList.map((attempt) => {
        const isSubmitted = Boolean(attempt.submitted_at);
        const idle = !isSubmitted && now - new Date(attempt.last_active_at).getTime() > IDLE_THRESHOLD_MS;
        const attemptAnswers = answersByAttempt[attempt.id] ?? [];

        return (
          <div key={attempt.id} className="p-4">
            <button
              type="button"
              onClick={() => setExpanded(expanded === attempt.id ? null : attempt.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="font-medium">{attempt.guest_name}</p>
                <p className="text-sm text-gray-500">
                  Soal {attempt.current_question_index + 1} / {questions.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {idle && (
                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                    ⚠️ idle / mungkin kesulitan
                  </span>
                )}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isSubmitted ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {isSubmitted
                    ? `Selesai${attempt.total_score !== null ? ` — ${attempt.total_score}` : " — menunggu nilai"}`
                    : "Mengerjakan"}
                </span>
              </div>
            </button>

            {expanded === attempt.id && (
              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
                {questions.map((question) => {
                  const answer = attemptAnswers.find((a) => a.question_id === question.id);
                  return (
                    <div key={question.id} className="rounded bg-gray-50 p-3 text-sm">
                      <p className="font-medium">
                        <MathText text={ringkasIsiSoal(question.prompt)} />
                      </p>
                      <p className="mt-1 text-gray-600">
                        Jawaban:{" "}
                        {answer ? (
                          <MathText text={jawabanRingkas(question, answer.response)} />
                        ) : (
                          <em className="text-gray-400">belum dijawab</em>
                        )}
                      </p>
                      {answer && (
                        <FeedbackField answerId={answer.id} initial={answer.tutor_feedback ?? ""} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
