import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionBankItem } from "@/lib/types";
import { BLOOM_LEVELS } from "@/lib/bloom";
import BankItem from "../../BankItem";

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
 * TIDAK MENAMPILKAN PEMILIH BAB (`topikDariAsal`). Bukan karena sudah jelas,
 * melainkan karena menandai bab pada butir bertopik DILARANG oleh trigger
 * migrasi 148 — menyodorkan pemilihnya berarti menawarkan satu-satunya aksi di
 * kartu itu yang dijamin gagal.
 *
 * Dikelompokkan menurut PERUNTUKAN lebih dulu, baru level Bloom. Ketiga kolam
 * itu tidak boleh beririsan (145 untuk latihan-ujian, 164 untuk probe), dan
 * kelompok yang terlihat di layar adalah cara paling murah memastikan orang
 * yang menulis soal tahu ia sedang menulis untuk kolam yang mana.
 */
const PERUNTUKAN = [
  {
    key: "latihan" as const,
    judul: "Latihan",
    arti: "Paket bertingkat C1–C3 yang dikerjakan berulang sampai tuntas.",
  },
  {
    key: "ujian" as const,
    judul: "Ujian",
    arti: "Satu putaran, tanpa retry. Tidak boleh beririsan dengan butir latihan.",
  },
  {
    key: "probe" as const,
    judul: "Probe",
    arti:
      "Retest berkala dan pemanasan sesudah jeda panjang. C2–C3, berotasi, dan " +
      "tidak boleh jadi anggota paket mana pun.",
  },
];

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

  return (
    <div className="space-y-5">
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

      {butir.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Belum ada butir yang ditandai ke topik ini. Butir masuk lewat impor JSON di halaman
          Pengukuran.
        </p>
      ) : (
        PERUNTUKAN.map(({ key, judul, arti }) => {
          // `peruntukan` boleh null untuk butir yang ditulis sebelum kolomnya
          // ada (migrasi tera 142), dan yang lama semuanya butir latihan.
          const miliknya = butir.filter((b) => (b.peruntukan ?? "latihan") === key);
          if (miliknya.length === 0) return null;

          return (
            <section key={key} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {judul} <span className="font-normal text-gray-400">· {miliknya.length} butir</span>
                </h2>
                <p className="text-xs leading-relaxed text-gray-400">{arti}</p>
              </div>

              {BLOOM_LEVELS.map((lvl) => {
                const selevel = miliknya.filter((b) => b.bloom_level === lvl.value);
                if (selevel.length === 0) return null;
                return (
                  <div key={lvl.value} className="space-y-3">
                    <p className="text-xs font-medium text-gray-500">
                      {lvl.code} — {lvl.label}
                    </p>
                    {selevel.map((item) => (
                      <div key={item.id} id={`soal-${item.id}`} className="scroll-mt-6">
                        <BankItem
                          item={item}
                          subjects={[]}
                          initialTaggedIds={[]}
                          topikDariAsal
                          editHref={`/dashboard/bank/soal/${item.id}?dari=pengukuran:${topik.id}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Butir tanpa level Bloom tidak akan pernah masuk paket mana pun
                  (penyusunnya memilih menurut level), jadi ia disebut di sini
                  alih-alih diam-diam ikut terdaftar di bawah level lain. */}
              {miliknya.some((b) => b.bloom_level == null) && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-amber-600">
                    Tanpa level Bloom — tidak akan masuk paket mana pun
                  </p>
                  {miliknya
                    .filter((b) => b.bloom_level == null)
                    .map((item) => (
                      <div key={item.id} id={`soal-${item.id}`} className="scroll-mt-6">
                        <BankItem
                          item={item}
                          subjects={[]}
                          initialTaggedIds={[]}
                          topikDariAsal
                          editHref={`/dashboard/bank/soal/${item.id}?dari=pengukuran:${topik.id}`}
                        />
                      </div>
                    ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
