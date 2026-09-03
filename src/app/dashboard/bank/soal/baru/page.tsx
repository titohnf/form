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
 *
 * `?topik=` adalah pintu yang lain: butir PENGUKURAN, yang mendarat di sebuah
 * topik peta kompetensi dan tidak punya bab sama sekali (migrasi tera 148).
 * Sebelum ini pintu itu tidak ada — satu-satunya cara menulis butir pengukuran
 * dengan tangan adalah lewat sebuah bab yang tidak ada hubungannya, lalu
 * menukar topiknya sesudah tersimpan.
 *
 * Keduanya tidak boleh datang bersamaan: satu butir tidak bisa mendarat di dua
 * taksonomi, dan menebak mana yang dimaksud berarti menebak di mana soalnya
 * akan muncul.
 */
export default async function SoalBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; topik?: string }>;
}) {
  const { dari, topik: topikPeta } = await searchParams;
  if (Boolean(dari) === Boolean(topikPeta)) notFound();

  const supabase = await createClient();

  if (topikPeta) {
    const { data: topik } = await supabase
      .from("topik")
      .select("id, nama")
      .eq("id", topikPeta)
      .maybeSingle();
    if (!topik) notFound();
    const kembali = `/dashboard/bank/pengukuran/${topik.id}`;

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={kembali}
            aria-label={`Kembali ke ${topik.id}`}
            title={`Kembali ke ${topik.id}`}
            className="shrink-0 text-lg text-gray-400 transition-colors hover:text-gray-700"
          >
            ←
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Butir Pengukuran Baru</h1>
        </div>

        {/* Dikatakan sebelum ditulis, bukan ditemukan sesudah disimpan: butir
            baru lahir sebagai draf (migrasi tera 141) dan `topik_paket_items`
            hanya menyajikan butir aktif. */}
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-500">
          Butir ini lahir sebagai <span className="font-medium text-slate-700">draf</span> dan tidak
          akan sampai ke murid sampai statusnya dinaikkan di kartunya. Ia ditandai ke{" "}
          <span className="font-medium text-slate-700">{topik.id}</span>, jadi tidak punya bab
          kurikulum sama sekali.
        </p>

        <DraftItem
          tujuan={{ jenis: "topik", id: topik.id }}
          judul={`${topik.id} — ${topik.nama}`}
          kembali={kembali}
        />
      </div>
    );
  }

  // Sampai di sini berarti pintunya bab, dan `dari` pasti terisi — penjagaan
  // XOR di atas sudah memastikannya, tapi ia tidak menyempitkan tipenya.
  if (!dari) notFound();

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
        tujuan={{ jenis: "grup", id: topik.id }}
        judul={topicTrail(topik, mapel?.name as string | undefined)}
        kembali={`/dashboard/bank/${topik.id}`}
      />
    </div>
  );
}
