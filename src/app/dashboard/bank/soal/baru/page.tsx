import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CurriculumTopicGroup } from "@/lib/types";
import { topicTrail } from "@/lib/curriculum";
import DraftItem from "./DraftItem";

/**
 * Halaman menulis soal baru — satu soal, satu layar, dan belum ada barisnya di
 * bank sampai tombol Simpan ditekan.
 *
 * Topiknya datang lewat `?dari=`: tombol yang membawa orang kemari selalu tahu
 * topiknya, dan menanyakannya lagi di sini hanya menambah satu langkah untuk
 * hal yang sudah diputuskan.
 */
export default async function SoalBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string }>;
}) {
  const { dari } = await searchParams;
  if (!dari) notFound();

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("curriculum_topic_groups")
    .select("id, subject_id, curriculum, grade_level, semester, theme, topic")
    .eq("id", dari)
    .maybeSingle();
  if (!group) notFound();
  const topik = group as CurriculumTopicGroup;

  // Satu baris, bukan seluruh tabel mapel: yang dibutuhkan halaman ini cuma
  // nama mapel dari topik yang sudah dipegang.
  const { data: mapel } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", topik.subject_id)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Panahnya mendahului judul, dan cuma panah: nama topiknya sudah
          terbaca utuh di label kartu di bawah, jadi menuliskannya lagi di sini
          berarti judul halaman diapit dua salinan hal yang sama. */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/bank/${topik.id}`}
          aria-label={`Kembali ke ${topik.topic}`}
          title={`Kembali ke ${topik.topic}`}
          className="shrink-0 text-lg text-gray-400 transition-colors hover:text-gray-700"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Soal Baru</h1>
      </div>

      <DraftItem
        groupId={topik.id}
        judul={topicTrail(topik, mapel?.name as string | undefined)}
        kembali={`/dashboard/bank/${topik.id}`}
      />
    </div>
  );
}
