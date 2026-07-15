import type { Question } from "@/lib/types";

export interface GradeResult {
  autoScore: number | null;
  needsManualGrading: boolean;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Grades a single response against its question's answer key. Essays are never auto-graded. */
export function gradeAnswer(question: Question, response: unknown): GradeResult {
  switch (question.type) {
    case "mcq_single":
    case "true_false": {
      const correct = normalize(question.correct_answer) === normalize(response);
      return { autoScore: correct ? question.weight : 0, needsManualGrading: false };
    }
    case "short_answer": {
      const keys = Array.isArray(question.correct_answer)
        ? (question.correct_answer as unknown[])
        : [question.correct_answer];
      const correct = keys.some((key) => normalize(key) === normalize(response));
      return { autoScore: correct ? question.weight : 0, needsManualGrading: false };
    }
    case "essay":
    default:
      return { autoScore: null, needsManualGrading: true };
  }
}

/** Sums a quiz attempt's total score from graded answers; null while any answer is ungraded. */
export function totalScore(
  answers: { auto_score: number | null; manual_score: number | null; needs_manual_grading: boolean }[],
): number | null {
  let sum = 0;
  for (const answer of answers) {
    if (answer.needs_manual_grading && answer.manual_score === null) {
      return null;
    }
    sum += answer.needs_manual_grading ? (answer.manual_score ?? 0) : (answer.auto_score ?? 0);
  }
  return sum;
}
