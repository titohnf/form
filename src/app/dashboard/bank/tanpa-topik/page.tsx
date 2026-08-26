import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup, QuestionBankItem, Subject } from "@/lib/types";
import { bySubject } from "@/lib/curriculum";
import { fetchAllPages } from "@/lib/paginate";
import BankItem from "../BankItem";

/**
 * Soal yang belum ditandai topik mana pun.
 *
 * Tabel di halaman depan disusun dari taksonomi, jadi soal tanpa topik tidak
 * punya baris di sana — dan tanpa halaman ini ia hidup di database tanpa bisa
 * dibuka dari mana pun. Berdiri sendiri, bukan bagian tertutup di daftar
 * topik: ini keadaan yang harus dibereskan, bukan kategori yang perlu
 * ditelusuri.
 */
export default async function UntaggedPage() {
  const supabase = await createClient();

  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const { data: groupRows } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic");

  const { rows: items } = await fetchAllPages<QuestionBankItem>((from, to) =>
    supabase
      .from("question_bank_items")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const { rows: tags } = await fetchAllPages<{ question_bank_item_id: string }>((from, to) =>
    supabase
      .from("question_curriculum_tags")
      .select("question_bank_item_id")
      .order("question_bank_item_id", { ascending: true })
      .range(from, to),
  );

  // PostgREST tidak punya "NOT IN (subquery)" tanpa view atau RPC, dan menambah
  // keduanya berarti migrasi di repo Tera untuk satu halaman baca — jadi
  // selisihnya diambil di sini.
  const tagged = new Set(tags.map((t) => t.question_bank_item_id));
  const untagged = items.filter((i) => !tagged.has(i.id));

  const subjects = bySubject(
    (groupRows ?? []) as CurriculumTopicGroup[],
    (subjectRows ?? []) as Subject[],
  );

  return (
    <div className="space-y-5">
      <Link href="/dashboard/bank" className="text-sm text-gray-500 underline">
        ← Kembali ke Bank Soal
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Belum ditandai topik</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {untagged.length} soal tanpa topik. Selama begini, tidak satu pun akan muncul di Latihan
          Soal murid di Tera, dan tidak bisa ditarik lewat pemilih topik saat menyusun paket. Tandai
          topiknya lewat bagian “Topik” di tiap kartu.
        </p>
      </div>

      {untagged.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Semua soal sudah punya topik.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {untagged.map((item) => (
            <div key={item.id} id={`soal-${item.id}`} className="scroll-mt-6">
              <BankItem
                item={item}
                subjects={subjects}
                initialTaggedIds={[]}
                editHref={`/dashboard/bank/soal/${item.id}?dari=tanpa-topik`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
