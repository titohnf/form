import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup, QuestionBankItem, Subject } from "@/lib/types";
import { bySubject, topicTrail } from "@/lib/curriculum";
import BankItem from "../../BankItem";

/**
 * Satu soal, satu halaman.
 *
 * Ke sinilah "+ Soal Baru" mendarat. Sebelumnya soal baru dibuat lalu halaman
 * topiknya dimuat ulang dan digulung ke kartu yang baru lahir — yang berarti
 * menulis satu soal dilakukan sambil ditemani sepuluh soal lain yang sudah jadi,
 * di halaman yang panjangnya beberapa layar. Di sini tidak ada yang lain di
 * layar selain soal yang sedang ditulis.
 *
 * `dari` menyimpan topik tempat orangnya berangkat, semata untuk jalan pulang:
 * satu soal boleh bertanda beberapa topik, jadi soal ini bukan milik salah satu
 * dari mereka, dan alamatnya pun tidak berada di bawah topik mana pun.
 */
export default async function SoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ dari?: string }>;
}) {
  const { itemId } = await params;
  const { dari } = await searchParams;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("question_bank_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) notFound();

  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const { data: groupRows } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic");

  const { data: tagRows } = await supabase
    .from("question_curriculum_tags")
    .select("group_id")
    .eq("question_bank_item_id", itemId);

  const groups = (groupRows ?? []) as CurriculumTopicGroup[];
  const subjects = bySubject(groups, (subjectRows ?? []) as Subject[]);
  const tagged = (tagRows ?? []).map((t) => t.group_id as string);

  // Judul jalan pulang menyebut topiknya, bukan "kembali" saja: soal ini bisa
  // ditandai ke topik lain dari kartunya, dan tanpa nama itu tidak jelas ke
  // mana tombolnya akan membawa.
  const asal = dari ? groups.find((g) => g.id === dari) : undefined;
  // "tanpa-topik" bukan topik, tapi tetap sebuah daftar yang bisa dipulangi.
  const kembali = asal
    ? { href: `/dashboard/bank/${asal.id}`, nama: asal.topic }
    : dari === "tanpa-topik"
      ? { href: "/dashboard/bank/tanpa-topik", nama: "Belum ditandai topik" }
      : { href: "/dashboard/bank", nama: "Bank Soal" };

  const mapel = asal
    ? subjects.find((s) => s.subjectId === asal.subject_id)?.subjectName
    : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Sebentuk dengan halaman "Soal Baru": panah dulu, baru judulnya. Nama
          tujuannya hidup di `title` dan `aria-label`, bukan di layar — label
          kartu di bawah sudah menyebut topiknya. */}
      <div className="flex items-center gap-3">
        <Link
          href={kembali.href}
          aria-label={`Kembali ke ${kembali.nama}`}
          title={`Kembali ke ${kembali.nama}`}
          className="shrink-0 text-lg text-gray-400 transition-colors hover:text-gray-700"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Edit Soal</h1>
      </div>

      <BankItem
        item={item as QuestionBankItem}
        subjects={subjects}
        initialTaggedIds={tagged}
        selesai={kembali.href}
        topikDariAsal={Boolean(asal)}
        judul={asal ? topicTrail(asal, mapel) : kembali.nama}
      />
    </div>
  );
}
