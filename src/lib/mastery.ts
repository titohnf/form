import type { MasteryBand } from "@/lib/types";

/** Percentage of the maximum score, 0–100. Returns 0 when nothing was attempted. */
export function percentOf(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}

/**
 * The label a class's rubric gives to a percentage — the highest band whose
 * `min` is reached. Returns null when the class has no rubric, in which case
 * callers show the raw percentage instead. Nothing here knows the TKA labels;
 * the bands come from `classes.mastery_rubric`.
 */
export function masteryLabel(rubric: MasteryBand[] | null, percent: number): string | null {
  if (!rubric || rubric.length === 0) return null;

  // Not assumed sorted: the column is free-form JSON and older rows may predate
  // the editor that sorts on save.
  const reached = [...rubric].sort((a, b) => a.min - b.min).filter((band) => percent >= band.min);
  return reached.length > 0 ? reached[reached.length - 1].label : rubric[0].label;
}
