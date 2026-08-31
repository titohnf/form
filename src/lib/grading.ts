/**
 * Yang tersisa dari penilaian di sisi TypeScript: penjumlahan, bukan aturan.
 *
 * `gradeAnswer()` dulu tinggal di sini, dan kembarannya di `nilaiJawaban()`
 * pada repo `tera`. Keduanya menilai satu jawaban dengan aturan yang wajib
 * sama persis — dijaga oleh komentar saling menunjuk, dan tidak oleh apa pun
 * yang bisa gagal secara terlihat. Sejak migrasi tera 136/137 aturan itu punya
 * SATU definisi, `nilai_jawaban()` di Postgres, dipanggil kedua aplikasi lewat
 * database yang memang sudah mereka bagi. Alasannya bukan bahwa SQL lebih
 * baik, melainkan bahwa dua repo ini tidak berbagi paket npm — dan paket privat
 * cuma akan menukar duplikasi yang terlihat dengan version skew yang tidak.
 *
 * Yang di bawah ini tetap di sini karena ia bukan aturan skoring: ia soal
 * bagaimana nilai sebuah PERCOBAAN disusun dari jawaban-jawabannya, termasuk
 * menahan angkanya selama masih ada soal yang menunggu dinilai tutor. Itu
 * urusan Sora sendiri; Tera tidak punya esai di jalur latihannya.
 *
 * Kesetaraan `nilai_jawaban()` dengan kedua berkas lama itu dibuktikan sebelum
 * keduanya dihapus, dan tetap dijaga: `scripts/uji-nilai-jawaban.ts`.
 */

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
