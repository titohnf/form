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
  const scope = [group.grade_level, semester, group.theme]
    .filter(Boolean)
    .join(" · ");
  return scope ? `${scope} — ${group.topic}` : group.topic;
}

/** Groups topics by subject, each list ordered the way Tera's curriculum page orders them. */
export function bySubject(
  groups: CurriculumTopicGroup[],
  subjects: { id: string; name: string }[],
): { subjectId: string; subjectName: string; groups: CurriculumTopicGroup[] }[] {
  return subjects
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      groups: groups
        .filter((g) => g.subject_id === subject.id)
        .sort(
          (a, b) =>
            a.grade_level.localeCompare(b.grade_level) ||
            a.semester - b.semester ||
            (a.theme ?? "").localeCompare(b.theme ?? "") ||
            a.topic.localeCompare(b.topic),
        ),
    }))
    .filter((entry) => entry.groups.length > 0);
}
