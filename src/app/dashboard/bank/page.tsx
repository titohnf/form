import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup, Subject } from "@/lib/types";
import { bySubject } from "@/lib/curriculum";
import { fetchAllPages } from "@/lib/paginate";
import { NewItemDialog } from "./NewItem";
import { ImportGlobalDialog } from "./ImportDialog";
import TopicTable, { type TopicRow } from "./TopicTable";

/**
 * Bank Soal: daftar TOPIK, bukan daftar soal.
 *
 * Dulu halaman ini membentangkan setiap soal sebagai kartu editor penuh,
 * dikelompokkan per topik. Itu berarti membuka halaman depan berarti memuat
 * seluruh korpus beserta isi tiap pertanyaannya — dan topik yang belum punya
 * soal tidak dirender sama sekali, padahal justru topik itulah yang perlu
 * diisi.
 *
 * Sekarang barisnya topik, dan isinya baru dimuat di `[groupId]`. Yang diambil
 * di sini cuma `id` dan `explanation` — cukup untuk menghitung kolomnya, tanpa
 * menyeret satu pun teks pertanyaan.
 */
export default async function BankPage() {
  const supabase = await createClient();

  // Taksonomi hidup di Tera: mapel dan topik dibaca di sini, tidak pernah
  // ditulis. RLS hanya mengizinkan admin.
  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const { data: groupRows } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic");

  // Ikut `explanation`: satu kolom teks per soal, jauh lebih murah daripada
  // memuat pertanyaannya, dan tanpa itu tabel tidak bisa membedakan topik yang
  // soalnya siap dipakai di Latihan Soal dari yang masih bisu saat dijawab.
  const { rows: items, truncated } = await fetchAllPages<{
    id: string;
    explanation: string | null;
  }>((from, to) =>
    supabase
      .from("question_bank_items")
      .select("id, explanation")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Penandaan many-to-many, jadi barisnya lebih banyak daripada soalnya — kalau
  // ini terpotong, topik yang sudah terisi tampil sebagai kosong dan orang akan
  // mengisinya ulang.
  const { rows: tags } = await fetchAllPages<{ question_bank_item_id: string; group_id: string }>(
    (from, to) =>
      supabase
        .from("question_curriculum_tags")
        .select("question_bank_item_id, group_id")
        .order("question_bank_item_id", { ascending: true })
        .order("group_id", { ascending: true })
        .range(from, to),
  );

  const typedGroups = (groupRows ?? []) as CurriculumTopicGroup[];
  const typedSubjects = (subjectRows ?? []) as Subject[];
  const subjects = bySubject(typedGroups, typedSubjects);
  const itemById = new Map(items.map((i) => [i.id, i]));

  const idsByGroup = new Map<string, string[]>();
  for (const t of tags) {
    const list = idsByGroup.get(t.group_id);
    if (list) list.push(t.question_bank_item_id);
    else idsByGroup.set(t.group_id, [t.question_bank_item_id]);
  }

  // Semua topik ikut, termasuk yang nol soal: barisnya inilah daftar kerjanya.
  // Urutannya mengikuti `bySubject` supaya sama dengan halaman kurikulum Tera.
  const rows: TopicRow[] = subjects.flatMap((subject) =>
    subject.groups.map((group) => {
      const own = (idsByGroup.get(group.id) ?? [])
        .map((id) => itemById.get(id))
        .filter((i) => i !== undefined);
      return {
        groupId: group.id,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        grade: group.grade_level,
        theme: group.theme,
        topic: group.topic,
        total: own.length,
        withExplanation: own.filter((i) => (i.explanation ?? "").trim() !== "").length,
      };
    }),
  );

  const taggedIds = new Set(tags.map((t) => t.question_bank_item_id));
  const untagged = items.filter((i) => !taggedIds.has(i.id)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Bank Soal</h1>
        {/* Dua jalan masuk yang sama derajatnya: menulis satu soal, atau
            memasukkan sekumpulan sekaligus dari CSV. Impor berdiri sebagai
            tombol sekunder — ia yang lebih jarang dipakai, tapi ia yang
            mengisi topik kosong dalam sekali jalan. */}
        <div className="flex shrink-0 items-center gap-2">
          <ImportGlobalDialog subjects={subjects} />
          <NewItemDialog subjects={subjects} />
        </div>
      </div>

      {truncated && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Korpusnya lebih besar dari yang bisa dimuat sekali jalan; sebagian soal belum ikut
          terhitung. Jumlah di tabel ini bisa lebih kecil dari yang sebenarnya.
        </p>
      )}

      {/* Soal tanpa topik tidak punya baris di tabel — tabelnya disusun dari
          taksonomi, bukan dari soalnya. Tanpa pintu ini mereka tidak terjangkau
          dari mana pun, dan mereka tidak akan pernah sampai ke murid. */}
      {untagged > 0 && (
        <Link
          href="/dashboard/bank/tanpa-topik"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          <span className="font-medium">{untagged} soal belum ditandai topik</span> — soal seperti
          ini tidak akan pernah muncul di Latihan Soal murid. Buka untuk menandainya →
        </Link>
      )}

      <TopicTable rows={rows} />
    </div>
  );
}
