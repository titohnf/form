import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup, QuestionBankItem, Subject } from "@/lib/types";
import { bySubject, jenjang } from "@/lib/curriculum";
import { fetchAllPages } from "@/lib/paginate";
import BankItem from "../BankItem";
import ImportDialog from "../ImportDialog";
import TopicHeader from "./TopicHeader";
import { NewItemInTopic } from "../NewItem";

/**
 * Semua soal satu topik.
 *
 * Halaman sendiri, bukan baris yang memuai di dalam tabel: kartu soal di sini
 * adalah editor penuh, dan membentangkan sepuluh di dalam daftar akan
 * mengembalikan persis berat yang membuat halaman lama lambat. Dengan rute
 * sendiri, yang dimuat cuma soal topik ini — dan alamatnya bisa dibagikan serta
 * ditinggalkan tanpa kehilangan tempat.
 */
export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();
  const typedGroup = group as CurriculumTopicGroup;

  // Taksonomi lengkap tetap dibutuhkan: tiap kartu soal punya pemilih topik
  // sendiri, dan satu soal boleh ditandai ke topik mana pun, bukan cuma ini.
  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const { data: groupRows } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic");

  // Hanya soal topik ini. Inilah gunanya halaman terpisah: korpus penuh tidak
  // pernah ikut terseret hanya karena seseorang membuka satu topik.
  const { rows: tagRows } = await fetchAllPages<{ question_bank_item_id: string }>((from, to) =>
    supabase
      .from("question_curriculum_tags")
      .select("question_bank_item_id")
      .eq("group_id", groupId)
      .order("question_bank_item_id", { ascending: true })
      .range(from, to),
  );
  const itemIds = tagRows.map((t) => t.question_bank_item_id);

  const { rows: items } = itemIds.length
    ? await fetchAllPages<QuestionBankItem>((from, to) =>
        supabase
          .from("question_bank_items")
          .select("*")
          .in("id", itemIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      )
    : { rows: [] as QuestionBankItem[] };

  // Penandaan soal-soal ini ke topik LAIN, supaya tiap kartu tahu kotak mana
  // saja yang harus tercentang.
  const { rows: allTags } = itemIds.length
    ? await fetchAllPages<{ question_bank_item_id: string; group_id: string }>((from, to) =>
        supabase
          .from("question_curriculum_tags")
          .select("question_bank_item_id, group_id")
          .in("question_bank_item_id", itemIds)
          .order("question_bank_item_id", { ascending: true })
          .order("group_id", { ascending: true })
          .range(from, to),
      )
    : { rows: [] as { question_bank_item_id: string; group_id: string }[] };

  const subjects = bySubject(
    (groupRows ?? []) as CurriculumTopicGroup[],
    (subjectRows ?? []) as Subject[],
  );
  const subjectName =
    ((subjectRows ?? []) as Subject[]).find((s) => s.id === typedGroup.subject_id)?.name ?? null;

  return (
    <div className="space-y-5">
      {/* Warnanya menandai jenjang, bukan menghias: tutor melompat antar topik
          sepanjang hari, dan warna kepala halaman memberitahu ia sedang di SD,
          SMP, atau SMA sebelum satu kata pun dibaca. Topik tanpa angka kelas
          jatuh ke abu netral — lebih baik tak berwarna daripada diwarnai asal. */}
      <TopicHeader
        warna={WARNA_JENJANG[jenjang(typedGroup.grade_level) ?? "lain"]}
        topic={typedGroup.topic}
        // Kelas dulu, baru mapel: urutan yang sama dengan label kartu soal
        // ("Kelas 9 · Matematika · Bilangan · Bilangan Real"). Topik yang sama
        // dibaca dua kali dengan urutan berbeda membuat orang mengira ia
        // sedang melihat dua hal.
        keterangan={[typedGroup.grade_level, subjectName, typedGroup.theme].filter(
          (bagian): bagian is string => Boolean(bagian),
        )}
        jumlah={items.length}
        // Instans tersendiri, bukan tombol yang sama dipindah: memindahkannya
        // berarti panel impor yang sedang terbuka ikut tercabut begitu halaman
        // digulung.
        aksiRingkas={
          <>
            <NewItemInTopic groupId={typedGroup.id} compact />
            <ImportDialog groupId={typedGroup.id} topic={typedGroup.topic} />
          </>
        }
      >
        {/* Tombolnya anak langsung kepala, bukan dibungkus kotak sendiri: saat
            panel impor dibuka, panelnya `w-full` dan harus bisa terlempar ke
            barisnya sendiri di bawah judul — di dalam kotak tombol ia akan
            terhimpit selebar tombolnya. Impor ditaruh terakhir supaya panel
            yang terbuka tidak mendorong tombol "+ Soal Baru" ikut turun. */}
        <NewItemInTopic groupId={typedGroup.id} compact />
        <ImportDialog groupId={typedGroup.id} topic={typedGroup.topic} />
      </TopicHeader>

      <div className="flex flex-col gap-5">
        {items.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
            Topik ini belum punya soal. Impor sekumpulan dari CSV di atas, atau buat satu per satu.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} id={`soal-${item.id}`} className="scroll-mt-6">
            <BankItem
              item={item}
              subjects={subjects}
              editHref={`/dashboard/bank/soal/${item.id}?dari=${typedGroup.id}`}
              initialTaggedIds={allTags
                .filter((t) => t.question_bank_item_id === item.id)
                .map((t) => t.group_id)}
            />
          </div>
        ))}

        <NewItemInTopic groupId={typedGroup.id} />
      </div>
    </div>
  );
}

/**
 * Latar kepala halaman per jenjang.
 *
 * Ditulis utuh, bukan dirakit dari potongan (`bg-${warna}-600`): Tailwind
 * memindai kelas sebagai teks apa adanya, dan nama yang baru terbentuk saat
 * program berjalan tidak pernah ikut ke berkas CSS-nya.
 *
 * Nadanya cukup tua supaya teks putih di atasnya terbaca. Versi pastel sempat
 * dicoba dan dibatalkan: dengan latar semuda itu, judul dan keterangannya
 * berbaur dengan warnanya sendiri, dan bar-nya berhenti terbaca sebagai kepala
 * halaman.
 */
const WARNA_JENJANG: Record<"SD" | "SMP" | "SMA" | "lain", string> = {
  SD: "bg-red-700",
  SMP: "bg-sky-600",
  SMA: "bg-slate-500",
  lain: "bg-slate-600",
};
