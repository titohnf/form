"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";
import QuestionEditor from "./QuestionEditor";
import { deleteQuestion, reorderQuestions, saveQuestion, saveToBank } from "./actions";

/**
 * Owns the order of questions so a drag reorders the list instantly and the
 * server catches up afterwards. Prompts are mirrored here too, because the
 * branching dropdowns label their targets by prompt and should follow along as
 * the tutor types instead of waiting for a page refresh.
 */
export default function QuestionList({
  quizId,
  initialQuestions,
  sequentialMode,
  canSaveToBank,
}: {
  quizId: string;
  initialQuestions: Question[];
  sequentialMode: boolean;
  /**
   * Bank soal bersama admin-only, jadi tombol "Simpan ke Bank" disembunyikan
   * untuk tutor. RLS memang sudah menolak salinannya, tapi tombol yang selalu
   * gagal lebih buruk daripada tombol yang tidak ada.
   */
  canSaveToBank: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Re-sync when the server sends a different set of questions (add, delete,
  // add-from-bank, AI generate). Comparing ids keeps a tutor's in-progress
  // edits from being clobbered by an unrelated revalidation.
  const serverIds = initialQuestions.map((q) => q.id).join(",");
  const lastServerIds = useRef(serverIds);
  useEffect(() => {
    if (serverIds !== lastServerIds.current) {
      lastServerIds.current = serverIds;
      setQuestions(initialQuestions);
    }
  }, [serverIds, initialQuestions]);

  function handleDrop(targetIndex: number) {
    setOverIndex(null);
    if (dragIndex === null || dragIndex === targetIndex) return;

    const next = [...questions];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);

    setQuestions(next);
    setDragIndex(null);
    lastServerIds.current = next.map((q) => q.id).join(",");
    reorderQuestions(
      quizId,
      next.map((q) => q.id),
    );
  }

  function handleDelete(questionId: string) {
    const next = questions.filter((q) => q.id !== questionId);
    setQuestions(next);
    lastServerIds.current = next.map((q) => q.id).join(",");
    deleteQuestion(quizId, questionId);
  }

  return (
    <div className="flex flex-col gap-4">
      {questions.map((question, index) => (
        <div
          key={question.id}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(index);
          }}
          onDragLeave={(e) => {
            // Ignore the leave events fired while crossing this card's own
            // children, otherwise the indicator flickers on every hop.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setOverIndex((prev) => (prev === index ? null : prev));
          }}
          onDrop={() => handleDrop(index)}
          className={
            overIndex === index && dragIndex !== index
              ? "rounded border-t-2 border-t-blue-500"
              : undefined
          }
        >
          <QuestionEditor
            question={question}
            label={`Soal ${index + 1}`}
            save={(patch) => saveQuestion(question.id, patch)}
            onSaveToBank={
              canSaveToBank && !question.bank_item_id ? () => saveToBank(question.id) : undefined
            }
            branchingContext={{
              sequentialMode,
              otherQuestions: questions.map((q) => ({ id: q.id, prompt: q.prompt })),
            }}
            onPromptChange={(prompt) =>
              setQuestions((prev) =>
                prev.map((q) => (q.id === question.id ? { ...q, prompt } : q)),
              )
            }
            onDelete={() => handleDelete(question.id)}
            dragHandleProps={{
              draggable: true,
              onDragStart: (e) => {
                // Firefox refuses to start a drag unless the event carries
                // data, so seed it even though handleDrop reads dragIndex.
                e.dataTransfer.setData("text/plain", question.id);
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(index);
              },
              onDragEnd: () => {
                setDragIndex(null);
                setOverIndex(null);
              },
            }}
          />
        </div>
      ))}
    </div>
  );
}
