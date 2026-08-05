"use client";

import { useState } from "react";
import type { CurriculumTopicGroup, Question, QuestionBankItem } from "@/lib/types";
import { topicLabel } from "@/lib/curriculum";
import QuestionEditor from "../quizzes/[id]/edit/QuestionEditor";
import { saveBankItem, deleteBankItem, toggleQuestionTopic } from "./actions";

export interface SubjectTopics {
  subjectId: string;
  subjectName: string;
  groups: CurriculumTopicGroup[];
}

/**
 * A bank item wrapped in the same builder the quiz editor uses, plus the topic
 * tags that only exist here. A tag is what makes a question reachable from
 * practice mode, so an untagged item is called out rather than left silent.
 */
export default function BankItem({
  item,
  subjects,
  initialTaggedIds,
}: {
  item: QuestionBankItem;
  subjects: SubjectTopics[];
  initialTaggedIds: string[];
}) {
  const [tagged, setTagged] = useState<string[]>(initialTaggedIds);

  // A bank item has no quiz, order, or branching — the editor treats those as
  // optional, so a minimal Question shape is enough to drive it.
  const asQuestion: Question = {
    id: item.id,
    quiz_id: "",
    type: item.type,
    prompt: item.prompt,
    options: item.options,
    correct_answer: item.correct_answer,
    weight: item.weight,
    order_index: 0,
    branching: null,
    explanation: item.explanation,
    stimulus_images: item.stimulus_images ?? [],
  };

  function toggle(topicId: string) {
    const next = tagged.includes(topicId);
    setTagged(next ? tagged.filter((id) => id !== topicId) : [...tagged, topicId]);
    toggleQuestionTopic(item.id, topicId, !next);
  }

  return (
    <div className="flex flex-col gap-2">
      <QuestionEditor
        question={asQuestion}
        label="Soal Bank"
        save={(patch) => saveBankItem(item.id, patch)}
        onDelete={() => deleteBankItem(item.id)}
      />

      <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs text-gray-500">
          Topik{" "}
          {tagged.length === 0 ? (
            <span className="text-amber-600">— belum ditandai, tidak akan muncul di latihan</span>
          ) : (
            `(${tagged.length})`
          )}
        </summary>

        {subjects.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Belum ada topik kurikulum. Susun dulu di Tera → Kurikulum.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {subjects.map((subject) => (
              <div key={subject.subjectId}>
                <p className="text-xs font-medium text-gray-500">{subject.subjectName}</p>
                <div className="mt-1 flex flex-col gap-1">
                  {subject.groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={tagged.includes(group.id)}
                        onChange={() => toggle(group.id)}
                      />
                      {topicLabel(group)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

