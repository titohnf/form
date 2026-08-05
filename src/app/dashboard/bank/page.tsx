import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup, QuestionBankItem, Subject } from "@/lib/types";
import { bySubject, topicLabel } from "@/lib/curriculum";
import { createBankItem } from "./actions";
import BankItem from "./BankItem";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic: topicFilter } = await searchParams;
  const supabase = await createClient();

  // The taxonomy lives in Tera: subjects and curriculum topic groups are read
  // here, never written. RLS admits admins only.
  const { data: items } = await supabase
    .from("question_bank_items")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const { data: groupRows } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic");
  const { data: tags } = await supabase
    .from("question_curriculum_tags")
    .select("question_bank_item_id, group_id");

  const typedItems = (items ?? []) as QuestionBankItem[];
  const typedGroups = (groupRows ?? []) as CurriculumTopicGroup[];
  const typedSubjects = (subjectRows ?? []) as Subject[];
  const typedTags = (tags ?? []) as { question_bank_item_id: string; group_id: string }[];

  const subjects = bySubject(typedGroups, typedSubjects);

  const visibleItems = topicFilter
    ? typedItems.filter((item) =>
        typedTags.some((t) => t.question_bank_item_id === item.id && t.group_id === topicFilter),
      )
    : typedItems;

  const untagged = typedItems.filter(
    (item) => !typedTags.some((t) => t.question_bank_item_id === item.id),
  );

  const idsForTopic = (groupId: string) =>
    new Set(
      typedTags.filter((t) => t.group_id === groupId).map((t) => t.question_bank_item_id),
    );

  // Dikelompokkan per topik, bukan satu daftar panjang: topiknya yang jadi
  // pegangan saat menyusun remedial, dan satu soal boleh muncul di beberapa
  // topik karena penandaannya memang many-to-many.
  const sections = subjects
    .map((subject) => ({
      ...subject,
      topics: subject.groups
        .map((group) => {
          const ids = idsForTopic(group.id);
          return { group, items: visibleItems.filter((item) => ids.has(item.id)) };
        })
        .filter((t) => t.items.length > 0),
    }))
    .filter((s) => s.topics.length > 0);

  const visibleUntagged = visibleItems.filter((item) =>
    untagged.some((u) => u.id === item.id),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Latihan Soal</h1>
        <form action={createBankItem}>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + Soal Baru
          </button>
        </form>
      </div>

      <p className="text-sm text-gray-500">
        Korpus soal bersama, dikelompokkan per topik kurikulum Tera. Soal di sini bisa dipakai ulang
        di asesmen, remedial, atau try out mana pun, dan menjadi sumber soal latihan mandiri murid —
        tapi hanya kalau topiknya sudah ditandai.
        {untagged.length > 0 && (
          <span className="text-amber-700"> {untagged.length} soal belum ditandai topik.</span>
        )}
      </p>

      <form
        method="get"
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <select
          name="topic"
          defaultValue={topicFilter ?? ""}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua topik</option>
          {subjects.map((subject) => (
            <optgroup key={subject.subjectId} label={subject.subjectName}>
              {subject.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {topicLabel(group)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
        >
          Filter
        </button>
      </form>

      <div className="flex flex-col gap-5">
        {visibleItems.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
            {typedItems.length === 0
              ? "Latihan soal masih kosong. Buat soal baru di sini, atau pakai tombol “Simpan ke Bank” di editor paket soal."
              : "Tidak ada soal dengan topik itu."}
          </p>
        )}

        {sections.map((subject) => (
          <section key={subject.subjectId} className="space-y-3">
            <h2 className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
              {subject.subjectName}
            </h2>
            {subject.topics.map(({ group, items }) => (
              <details
                key={group.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
                // Topik terbuka kalau memang sedang disaring — kalau tidak,
                // membuka satu-satunya hasil filter jadi pekerjaan ekstra.
                open={topicFilter === group.id}
              >
                <summary className="cursor-pointer text-sm font-medium text-gray-900">
                  {topicLabel(group)}{" "}
                  <span className="font-normal text-gray-400">({items.length} soal)</span>
                </summary>
                <div className="mt-4 flex flex-col gap-5">
                  {items.map((item) => (
                    <BankItem
                      key={item.id}
                      item={item}
                      subjects={subjects}
                      initialTaggedIds={typedTags
                        .filter((t) => t.question_bank_item_id === item.id)
                        .map((t) => t.group_id)}
                    />
                  ))}
                </div>
              </details>
            ))}
          </section>
        ))}

        {visibleUntagged.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold tracking-widest text-amber-700 uppercase">
              Belum ditandai topik
            </h2>
            <details className="rounded-2xl border border-amber-200 bg-white p-5" open>
              <summary className="cursor-pointer text-sm font-medium text-gray-900">
                Tanpa topik{" "}
                <span className="font-normal text-gray-400">({visibleUntagged.length} soal)</span>
              </summary>
              <p className="mt-2 text-sm text-gray-500">
                Soal-soal ini tidak akan pernah muncul di latihan mandiri murid sampai topiknya
                ditandai.
              </p>
              <div className="mt-4 flex flex-col gap-5">
                {visibleUntagged.map((item) => (
                  <BankItem key={item.id} item={item} subjects={subjects} initialTaggedIds={[]} />
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
