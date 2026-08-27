import type { CurriculumTopicGroup } from "@/lib/types";

/**
 * How a Tera curriculum topic reads in one line: "Kelas 7 · Sem 1 · Bilangan —
 * Operasi Hitung". Tera's taxonomy is subject → grade → semester → theme →
 * topic, so a topic's name alone ("Operasi Hitung") is ambiguous across grades.
 *
 * TKA is the exception: it has no semesters, and its rows only carry a semester
 * because the column is `not null` in Tera. Printing that filler would invent a
 * distinction that does not exist, so it is left out — same as Tera's own
 * curriculum page, which hides the semester control for TKA.
 */
export function topicLabel(group: CurriculumTopicGroup): string {
  const semester = group.curriculum === "TKA" ? null : `Sem ${group.semester}`;
  const scope = [group.grade_level, semester, group.theme].filter(Boolean).join(" · ");
  return scope ? `${scope} — ${group.topic}` : group.topic;
}

/**
 * Jejak topiknya sebagai label kartu: "Kelas 9 · Matematika · Bilangan ·
 * Bilangan Real".
 *
 * Beda dari `topicLabel` dalam dua hal, dan keduanya karena label ini menamai
 * satu kartu yang isinya sudah jelas, bukan membedakan satu baris dari 175
 * baris lain di daftar: semesternya tidak ikut — di kartu yang sedang disunting
 * "Sem 1" tidak menjawab pertanyaan siapa pun — dan pemisahnya seragam, jadi
 * mapel, kelas, tema, dan topik terbaca sebagai satu jalur menyempit, bukan
 * sebagai dua bagian yang dipisah tanda pisah. Kelasnya di depan: itu yang
 * paling cepat memberi tahu soal ini untuk siapa.
 *
 * Mapelnya tidak ada di dalam `group` — di sana ia cuma `subject_id` — jadi
 * namanya dititipkan pemanggil, yang memang sudah memegang daftar mapel.
 */
export function topicTrail(group: CurriculumTopicGroup, subjectName?: string | null): string {
  return [group.grade_level, subjectName, group.theme, group.topic].filter(Boolean).join(" · ");
}

/**
 * Letak tiap topik di dalam kurikulumnya, dibaca dari `curriculum_topics`.
 *
 * `curriculum_topic_groups` tidak punya kolom urutan — yang menyimpannya
 * `curriculum_topics`, tabel datar tempat satu topik adalah SEKUMPULAN baris CP
 * yang berbagi `group_id` (Tera, migrasi 060). Yang dipakai `sort_order`
 * terkecil di antara mereka: tempat topiknya muncul pertama kali.
 *
 * Angkanya berulang dari nol di tiap kelas, jadi ia tidak pernah dipakai
 * sendirian — selalu sesudah kelas dan semester diadu (lihat `bySubject`).
 */
export function urutanKurikulum(
  rows: { group_id: string | null; sort_order: number | null }[],
): Map<string, number> {
  const urutan = new Map<string, number>();
  for (const r of rows) {
    if (!r.group_id || r.sort_order == null) continue;
    const ada = urutan.get(r.group_id);
    if (ada == null || r.sort_order < ada) urutan.set(r.group_id, r.sort_order);
  }
  return urutan;
}

/** Groups topics by subject, each list ordered the way Tera's curriculum page orders them. */
export function bySubject(
  groups: CurriculumTopicGroup[],
  subjects: { id: string; name: string }[],
  /**
   * Urutan kurikulum dari `urutanKurikulum()`. Tanpa ini daftarnya jatuh ke
   * abjad tema lalu topik — masih tertib, tapi bukan urutan yang diajarkan:
   * "Aljabar" mendahului "Bilangan" karena huruf A, padahal Bilangan lebih
   * dulu. Topik yang tidak ada di peta turun ke bawah kelasnya, bukan hilang.
   */
  urutan?: Map<string, number>,
): { subjectId: string; subjectName: string; groups: CurriculumTopicGroup[] }[] {
  const letak = (g: CurriculumTopicGroup) => urutan?.get(g.id) ?? Number.MAX_SAFE_INTEGER;
  return subjects
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      groups: groups
        .filter((g) => g.subject_id === subject.id)
        .sort(
          (a, b) =>
            // `numeric` wajib: "Kelas 12" mendahului "Kelas 2" kalau
            // dibandingkan sebagai teks biasa, dan seluruh daftar kurikulum
            // tampil dengan kelas yang teracak.
            a.grade_level.localeCompare(b.grade_level, "id", { numeric: true }) ||
            a.semester - b.semester ||
            letak(a) - letak(b) ||
            (a.theme ?? "").localeCompare(b.theme ?? "", "id") ||
            a.topic.localeCompare(b.topic, "id"),
        ),
    }))
    .filter((entry) => entry.groups.length > 0);
}

/** SD / SMP / SMA, atau null kalau kelasnya tidak menyebut angka sama sekali. */
export type Jenjang = "SD" | "SMP" | "SMA";

/**
 * Jenjang sebuah kelas, dibaca dari angkanya: 1–6 SD, 7–9 SMP, 10–12 SMA.
 *
 * Tera menyimpan kelas sebagai teks ("Kelas 7"), bukan angka, dan tidak punya
 * kolom jenjang — jadi jenjangnya disimpulkan di sini alih-alih ditanyakan ke
 * seseorang lagi. Baris yang angkanya di luar 1–12 atau tanpa angka sama sekali
 * memulangkan null: lebih baik tidak berwarna daripada diwarnai asal.
 */
export function jenjang(gradeLevel: string): Jenjang | null {
  const angka = Number(gradeLevel.match(/\d+/)?.[0]);
  if (!angka) return null;
  if (angka <= 6) return "SD";
  if (angka <= 9) return "SMP";
  if (angka <= 12) return "SMA";
  return null;
}
