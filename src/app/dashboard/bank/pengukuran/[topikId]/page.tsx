import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionBankItem } from "@/lib/types";
import DaftarButir from "./DaftarButir";

/**
 * Butir sebuah topik pengukuran, satu daftar yang bisa dibaca dan disunting.
 *
 * KENAPA HALAMAN INI ADA. Sampai sekarang butir pengukuran tidak punya daftar
 * sendiri di mana pun. Halaman Pengukuran cuma menghitungnya ("C2: 8 butir"),
 * dan Bank Soal menyusun dunia menurut BAB kurikulum — sementara butir
 * bertopik sengaja tidak punya bab sejak migrasi tera 148. Akibatnya satu-
 * satunya tempat butir-butir itu benar-benar muncul adalah halaman "Belum
 * ditandai topik", yaitu halaman yang namanya sendiri menyatakan isinya adalah
 * keadaan yang harus dibereskan. Mencari satu soal D-01 berarti menyusuri
 * daftar puluhan soal yang tidak berhubungan, di halaman yang salah namanya.
 *
 * Jadi bukan sekadar kenyamanan: sebelum ini, tidak ada satu alamat pun yang
 * berarti "soal-soal pengukuran topik ini".
 *
 * Yang di sini cuma pengambilan datanya dan kepala halaman; daftarnya sendiri
 * hidup di `DaftarButir` karena ia butuh saringan, dan saringan adalah cara
 * membaca satu halaman — bukan cara menuju halaman yang berbeda.
 */
export default async function ButirTopikPage({
  params,
}: {
  params: Promise<{ topikId: string }>;
}) {
  const { topikId } = await params;
  const supabase = await createClient();

  const { data: topik } = await supabase
    .from("topik")
    .select("id, nama, elemen, jenjang_kelas, aktif")
    .eq("id", topikId)
    .maybeSingle();
  if (!topik) notFound();

  const { data: butirRows } = await supabase
    .from("question_bank_items")
    .select("*")
    .eq("topik_id", topikId)
    .order("peruntukan")
    .order("bloom_level")
    .order("created_at");

  const butir = (butirRows ?? []) as QuestionBankItem[];

  const hrefBaru = `/dashboard/bank/soal/baru?topik=${topik.id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/bank/pengukuran" className="text-sm text-gray-500 hover:text-blue-700">
            ← Pengukuran
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">
            {topik.id} — {topik.nama}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelas {topik.jenjang_kelas}
            {topik.aktif ? "" : " · belum aktif"} · {butir.length} butir
          </p>
        </div>

        {/* Menulis satu butir dengan tangan tidak lagi harus lewat sebuah bab
            kurikulum yang tidak ada hubungannya. Impor JSON tetap jalur utama
            untuk naskah yang datang berpuluh sekaligus; ini untuk yang satu. */}
        <Link
          href={hrefBaru}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
        >
          + Butir baru
        </Link>
      </div>

      {butir.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Belum ada butir yang ditandai ke topik ini. Naskah berisi banyak butir masuk lewat impor
          JSON di halaman Pengukuran; satu butir bisa ditulis langsung lewat{" "}
          <Link href={hrefBaru} className="text-blue-700 underline">
            Butir baru
          </Link>
          .
        </p>
      ) : (
        <DaftarButir butir={butir} topikId={topik.id} />
      )}
    </div>
  );
}
