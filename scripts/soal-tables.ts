/**
 * Tabel yang menyimpan soal buatan Sora, berurutan dari anak ke induk.
 *
 * Dipakai bersama oleh `backup-soal.ts` dan `wipe-soal.ts` supaya yang
 * dicadangkan mencakup yang dihapus — cadangan yang isinya lebih sedikit
 * daripada yang dibuang adalah cadangan yang berbohong. (Backup sengaja
 * mengambil lebih luas, lihat BACKUP_TABLES di bawah.)
 *
 * Yang TIDAK boleh ikut terhapus, meski namanya terdengar dekat:
 *
 * - `subjects`, `curriculum_topics`, `curriculum_topic_groups` — taksonomi
 *   kurikulum dari Tera. Soal baru digantung ke topik yang sama.
 * - `sessions` — jadwal sesi belajar.
 * - `assessments` dan `assessment_results`. Pada 30 Agustus 2026 isinya 109
 *   asesmen dan 153 nilai, tapi 106 asesmen di antaranya bertaut Google Form
 *   sejak 17 Juli — kerja tutor, bukan soal Sora; seluruh 153 nilai menempel
 *   di sana. Yang lahir dari paket cuma 3 baris, dan ketiganya terhapus
 *   sendiri lewat cascade begitu `quizzes` dikosongkan.
 * - `attempts`, `answers` — jejak pengerjaan paket oleh murid. Tidak dihapus
 *   langsung; keduanya memang ikut runtuh lewat cascade (lihat CASCADE_WATCH),
 *   tapi itu akibat, bukan sasaran.
 */
export const SOAL_TABLES = [
  // Cangkang latihan mandiri yang isinya sudah ikut runtuh bersama soalnya:
  // `practice_sessions` tinggal sesi tanpa jawaban, dan `practice_paket_locks`
  // mengunci nomor paket di bank yang isinya sudah berganti — kunci yang
  // menunjuk paket lama justru menyesatkan murid yang berlatih lagi nanti.
  "practice_paket_locks",
  "practice_answers",
  "practice_sessions",
  "questions",                // soal di dalam paket
  "quizzes",                  // paketnya sendiri (asesmen/remedial/try out)
  "question_curriculum_tags", // tautan butir soal ke topik kurikulum
  "question_bank_items",      // butiran soal di Bank Soal
] as const;

/**
 * Tabel yang ikut runtuh sendiri karena `on delete cascade` (migrasi tera 061,
 * 082, 133–135): jawaban dan pengerjaan yang menunjuk soal yang dibuang.
 *
 * Tidak dihapus langsung, hanya dihitung sebelum dan sesudah, supaya kerugian
 * sampingannya kelihatan angkanya — bukan ditemukan belakangan.
 */
export const CASCADE_WATCH = [
  "assessments",
  "attempts",
  "answers",
] as const;

/** Yang dicadangkan: sasaran penghapusan plus semua yang bisa terseret olehnya. */
export const BACKUP_TABLES = [...SOAL_TABLES, ...CASCADE_WATCH, "assessment_results"] as const;
