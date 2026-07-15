import type { MatchingOptions, OrderingOptions, Question } from "@/lib/types";

export interface GradeResult {
  autoScore: number | null;
  needsManualGrading: boolean;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedSet(values: unknown): Set<string> {
  const arr = Array.isArray(values) ? values : [];
  return new Set(arr.map(normalize));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

/** Grades a single response against its question's answer key. Essays and file uploads are never auto-graded. */
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
    case "mcq_multi": {
      const correct = setsEqual(normalizedSet(question.correct_answer), normalizedSet(response));
      return { autoScore: correct ? question.weight : 0, needsManualGrading: false };
    }
    case "matching": {
      const pairs = (question.options as MatchingOptions | null)?.pairs ?? [];
      const submitted = (response ?? {}) as Record<string, string>;
      const correct = pairs.every((pair) => normalize(submitted[pair.left]) === normalize(pair.right));
      return { autoScore: correct && pairs.length > 0 ? question.weight : 0, needsManualGrading: false };
    }
    case "ordering": {
      const correctOrder = (question.options as OrderingOptions | null)?.items ?? [];
      const submitted = Array.isArray(response) ? (response as unknown[]) : [];
      const correct =
        correctOrder.length > 0 &&
        correctOrder.length === submitted.length &&
        correctOrder.every((item, i) => normalize(item) === normalize(submitted[i]));
      return { autoScore: correct ? question.weight : 0, needsManualGrading: false };
    }
    case "fill_blank": {
      const keys = Array.isArray(question.correct_answer)
        ? (question.correct_answer as unknown[])
        : [];
      const submitted = Array.isArray(response) ? (response as unknown[]) : [];
      if (keys.length === 0) return { autoScore: 0, needsManualGrading: false };
      const correctCount = keys.filter((key, i) => normalize(key) === normalize(submitted[i])).length;
      return { autoScore: (question.weight * correctCount) / keys.length, needsManualGrading: false };
    }
    case "essay":
    case "upload_file":
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
