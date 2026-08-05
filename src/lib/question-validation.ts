import type {
  MatchingOptions,
  McqOptions,
  OrderingOptions,
  Question,
  StatementGridAnswer,
  StatementGridOptions,
} from "./types";

/**
 * Soal dibuat kosong lalu diisi lewat autosave, jadi sebuah paket soal bisa saja
 * masih menyimpan soal setengah jadi saat tutor menekan Terbitkan. Fungsi ini
 * mengembalikan alasan sebuah soal belum layak terbit, atau null kalau sudah.
 *
 * Esai dan upload file sengaja hanya butuh pertanyaan: keduanya dinilai manual
 * sehingga memang tidak punya kunci jawaban.
 *
 * Menerima potongan kolom saja supaya editor bisa memakainya atas draft yang
 * belum tersimpan, bukan cuma atas baris yang sudah ada di database.
 */
export function questionIssue(
  question: Pick<Question, "type" | "prompt" | "options" | "correct_answer">,
): string | null {
  if (!question.prompt.trim()) return "pertanyaan masih kosong";

  switch (question.type) {
    case "mcq_single":
    case "mcq_multi": {
      const choices =
        (question.options as McqOptions | null)?.choices?.filter((c) => c.trim()) ?? [];
      if (choices.length < 2) return "butuh minimal 2 pilihan jawaban";
      if (question.type === "mcq_single") {
        return typeof question.correct_answer === "string" &&
          choices.includes(question.correct_answer)
          ? null
          : "kunci jawaban belum ditandai";
      }
      return Array.isArray(question.correct_answer) && question.correct_answer.length > 0
        ? null
        : "kunci jawaban belum ditandai";
    }

    case "short_answer":
    case "fill_blank":
      return Array.isArray(question.correct_answer) && question.correct_answer.length > 0
        ? null
        : "kunci jawaban belum diisi";

    case "matching":
      return ((question.options as MatchingOptions | null)?.pairs?.length ?? 0) > 0
        ? null
        : "pasangan jawaban belum diisi";

    case "ordering":
      return ((question.options as OrderingOptions | null)?.items?.length ?? 0) > 1
        ? null
        : "butuh minimal 2 item untuk diurutkan";

    case "statement_grid": {
      const statements = (question.options as StatementGridOptions | null)?.statements ?? [];
      if (statements.length === 0) return "belum ada pernyataan";
      const key = (question.correct_answer ?? {}) as Partial<StatementGridAnswer>;
      const answers = Array.isArray(key.answers) ? key.answers : [];
      const marked = statements.every((_, i) => typeof answers[i] === "boolean");
      return marked ? null : "setiap pernyataan harus ditandai kuncinya";
    }

    case "true_false":
    case "essay":
    case "upload_file":
      return null;
  }
}

/** Semua soal yang belum layak terbit, beserta nomor urutnya di halaman edit. */
export function findQuizIssues(
  questions: Question[],
): { number: number; issue: string }[] {
  return questions
    .map((question, index) => ({ number: index + 1, issue: questionIssue(question) }))
    .filter((entry): entry is { number: number; issue: string } => entry.issue !== null);
}
