import type { Answer, Attempt, Question } from "./types";

export interface QuestionAccuracy {
  question: Question;
  /** Persen benar 0–100, atau null kalau belum ada jawaban yang dinilai. */
  accuracy: number | null;
  answeredCount: number;
}

/**
 * Ketepatan tiap soal di satu paket.
 *
 * Dipakai dua tempat yang harus sepakat: analitik di halaman Hasil, dan
 * pemilihan soal untuk remedial. Kalau rumusnya ditulis dua kali, angka yang
 * dilihat tutor dan soal yang benar-benar terbawa ke remedial bisa berbeda
 * tanpa ada yang menyadarinya.
 *
 * Soal esai yang belum dinilai tutor sengaja tidak dihitung: nilainya belum
 * ada, dan menganggapnya nol akan menyeret soal itu ke remedial hanya karena
 * penilaiannya belum sempat dikerjakan.
 */
export function perQuestionAccuracy(
  questions: Question[],
  answers: Answer[],
  attempts: Attempt[],
): QuestionAccuracy[] {
  const submitted = attempts.filter((a) => a.submitted_at);

  return questions.map((question) => {
    const relevant = answers.filter(
      (a) => a.question_id === question.id && submitted.some((at) => at.id === a.attempt_id),
    );
    const graded = relevant.filter((a) => !a.needs_manual_grading || a.manual_score !== null);
    const correctFraction = graded.reduce((sum, a) => {
      const score = a.needs_manual_grading ? (a.manual_score ?? 0) : (a.auto_score ?? 0);
      return sum + score / (question.weight || 1);
    }, 0);
    const accuracy = graded.length > 0 ? Math.round((correctFraction / graded.length) * 100) : null;
    return { question, accuracy, answeredCount: relevant.length };
  });
}

/**
 * Soal yang layak diremedialkan: ketepatannya di bawah ambang.
 *
 * Ambangnya diminta dari tutor, bukan ditetapkan di kode. Sora tidak punya
 * konsep KKM, dan mengarang satu angka di sini berarti memutuskan sesuatu yang
 * bukan urusan kode — berapa yang dianggap "belum dikuasai" berbeda antar mapel
 * dan antar kelas.
 */
export function weakQuestions(stats: QuestionAccuracy[], threshold: number): QuestionAccuracy[] {
  return stats.filter((s) => s.accuracy !== null && s.accuracy < threshold);
}
