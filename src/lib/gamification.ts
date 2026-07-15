import type { Attempt } from "@/lib/types";

export interface RankedAttempt {
  attempt: Attempt;
  rank: number;
  durationMs: number | null;
}

/** Ranks submitted attempts by score desc, tie-broken by fastest completion. */
export function rankAttempts(attempts: Attempt[]): RankedAttempt[] {
  const submitted = attempts.filter((a) => a.submitted_at && a.total_score !== null);

  const withDuration = submitted.map((attempt) => ({
    attempt,
    durationMs: attempt.submitted_at
      ? new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()
      : null,
  }));

  withDuration.sort((a, b) => {
    const scoreDiff = (b.attempt.total_score ?? 0) - (a.attempt.total_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity);
  });

  return withDuration.map((entry, i) => ({ ...entry, rank: i + 1 }));
}

export interface Badge {
  emoji: string;
  label: string;
}

/** Lightweight, computed-not-stored badges: perfect score and fastest completion among submitted attempts. */
export function computeBadges(
  attempt: Attempt,
  totalWeight: number,
  ranked: RankedAttempt[],
): Badge[] {
  const badges: Badge[] = [];
  if (totalWeight > 0 && attempt.total_score === totalWeight) {
    badges.push({ emoji: "🏆", label: "Skor Sempurna" });
  }
  const fastest = ranked.filter((r) => r.durationMs !== null).sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))[0];
  if (fastest && fastest.attempt.id === attempt.id) {
    badges.push({ emoji: "⚡", label: "Tercepat" });
  }
  return badges;
}
