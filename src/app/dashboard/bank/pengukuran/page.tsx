import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BLOOM_LEVELS } from "@/lib/bloom";
import ImporPengukuran from "./ImporPengukuran";
import TombolAktif from "./TombolAktif";
import TombolSusun from "./TombolSusun";

/**
 * Kesiapan pengukuran: berapa butir yang sudah ditandai per topik, dan paket
 * apa yang sudah tersusun darinya (PRD FR2).
 *
 * Halaman ini menjawab pertanyaan yang tidak bisa dijawab daftar Bank Soal
 * biasa. Bank Soal menyusun dunia menurut BAB — di bab mana sebuah soal
 * disodorkan — sementara paket pengukuran disusun menurut apa yang diukurnya,
 * dan sejak migrasi 148 butir bertopik justru sengaja tidak lagi punya bab.
 * Tanpa halaman ini, butir-butir itu tidak muncul di daftar mana pun.
 *
 * TIDAK ADA KOLOM "TARGET". Godaannya besar — Protokol Uji Coba menyebut 8
 * butir per level dan 12 butir ujian untuk D-01 — tapi angka itu milik D-01,
 * dan tiap topik di Learning Progression punya angkanya sendiri (D-02: 34,
 * D-08: 42). Menanam satu angka di sini berarti halaman ini akan berkata
 * "kurang 3" untuk topik yang sebenarnya sudah lengkap. Yang ditampilkan
 * jumlah sebenarnya; yang tahu berapa seharusnya adalah dokumennya.
 */
export default async function PengukuranPage() {
  const supabase = await createClient();

  const { data: topikRows } = await supabase
    .from("topik")
    .select("id, nama, elemen, jenjang_kelas, aktif, urutan")
    .order("urutan");

  // Hanya butir bertopik: sisa bank soal (ribuan butir latihan bebas) tidak
  // pernah jadi anggota paket pengukuran, dan menariknya ke sini cuma membuat
  // halaman lambat untuk pertanyaan yang tidak ia jawab.
  const { data: butirRows } = await supabase
    .from("question_bank_items")
    .select("id, topik_id, bloom_level, peruntukan, status_verifikasi")
    .not("topik_id", "is", null);

  const { data: paketRows } = await supabase
    .from("paket_topik")
    .select("id, topik_id, jenis, level_bloom, nomor, paket_topik_item(count)")
    .order("nomor");

  type Topik = {
    id: string;
    nama: string;
    elemen: string;
    jenjang_kelas: string;
    aktif: boolean;
  };
  type Butir = {
    id: string;
    topik_id: string;
    bloom_level: number | null;
    peruntukan: string | null;
    status_verifikasi: string | null;
  };
  type Paket = {
    id: string;
    topik_id: string;
    jenis: string;
    level_bloom: number | null;
    nomor: number;
    paket_topik_item: { count: number }[];
  };

  const topik = (topikRows ?? []) as Topik[];
  const butir = (butirRows ?? []) as Butir[];
  const paket = (paketRows ?? []) as Paket[];

  // Topik yang belum punya butir DAN belum aktif tidak ditampilkan: peta
  // kompetensi memuat 19 topik Fase D, delapan belas di antaranya rencana
  // jangka panjang, dan daftar yang didominasi baris kosong membuat satu topik
  // yang sedang dikerjakan jadi sulit ditemukan.
  const bertopik = new Set(butir.map((b) => b.topik_id));
  const tampil = topik.filter((t) => t.aktif || bertopik.has(t.id));
  // Sisa peta: ada di tabel, belum dibuka, belum diisi. Ditampilkan ringkas di
  // bawah — dulu ia tidak muncul sama sekali, dan akibatnya seluruh peta tidak
  // punya satu pun layar yang menunjukkannya.
  const belumDibuka = topik.filter((t) => !t.aktif && !bertopik.has(t.id));

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/bank" className="text-sm text-gray-500 hover:text-blue-700">
          ← Bank Soal
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Pengukuran</h1>
        <p className="mt-1 text-sm text-gray-500">
          Butir yang ditandai ke peta kompetensi, dan paket yang tersusun darinya. Butir di sini
          disajikan lewat peta — bukan lewat bab kurikulum. Tekan nama topiknya untuk membaca dan
          menyunting butirnya.
        </p>
        <div className="mt-4">
          <ImporPengukuran />
        </div>
      </div>

      {tampil.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow ring-1 ring-gray-900/5">
          Belum ada topik pengukuran yang aktif.
        </p>
      ) : (
        <div className="space-y-4">
          {tampil.map((t) => {
            const miliknya = butir.filter((b) => b.topik_id === t.id);
            const latihan = miliknya.filter((b) => (b.peruntukan ?? "latihan") === "latihan");
            const ujian = miliknya.filter((b) => b.peruntukan === "ujian");
            // Kolam ketiga (migrasi tera 164). Tanpa baris ini butir probe
            // tidak terhitung di mana pun di halaman ini — bukan latihan,
            // bukan ujian — dan sepuluh butir yang sudah ditulis terbaca
            // sebagai nol.
            const probe = miliknya.filter((b) => b.peruntukan === "probe");
            const belumAktif = miliknya.filter((b) => b.status_verifikasi !== "aktif").length;
            const paketnya = paket.filter((p) => p.topik_id === t.id);

            return (
              <section key={t.id} className="rounded-xl bg-white shadow ring-1 ring-gray-900/5">
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-3">
                  <div>
                    {/* Tautan, bukan teks: sampai sekarang halaman ini
                        menghitung butir tanpa menyediakan satu pun jalan
                        menuju butirnya. */}
                    <h2 className="text-sm font-semibold">
                      <Link
                        href={`/dashboard/bank/pengukuran/${t.id}`}
                        className="text-gray-900 hover:text-blue-700 hover:underline"
                      >
                        {t.id} — {t.nama}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Kelas {t.jenjang_kelas}
                      {t.aktif ? "" : " · belum aktif"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <TombolSusun topikId={t.id} />
                    <TombolAktif
                      topikId={t.id}
                      aktif={t.aktif}
                      punyaPaket={paketnya.some((p) => (p.paket_topik_item[0]?.count ?? 0) > 0)}
                    />
                  </div>
                </div>

                <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Butir tertandai</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      {BLOOM_LEVELS.map((b) => {
                        const n = latihan.filter((x) => x.bloom_level === b.value).length;
                        if (n === 0) return null;
                        return (
                          <li key={b.value}>
                            {b.code} — {b.label}: <span className="font-medium">{n}</span>
                          </li>
                        );
                      })}
                      {latihan.some((b) => b.bloom_level === null) && (
                        <li className="text-amber-600">
                          Tanpa level Bloom:{" "}
                          <span className="font-medium">
                            {latihan.filter((b) => b.bloom_level === null).length}
                          </span>{" "}
                          — tidak akan masuk paket mana pun.
                        </li>
                      )}
                      <li>
                        Ujian: <span className="font-medium">{ujian.length}</span>
                      </li>
                      {probe.length > 0 && (
                        <li>
                          Probe: <span className="font-medium">{probe.length}</span>
                        </li>
                      )}
                      {miliknya.length === 0 && (
                        <li className="text-gray-400">Belum ada butir yang ditandai ke topik ini.</li>
                      )}
                    </ul>
                    {belumAktif > 0 && (
                      <p className="mt-2 text-xs text-amber-600">
                        {belumAktif} butir belum berstatus <em>aktif</em>, jadi ikut tersusun ke
                        paket tapi tidak akan disajikan ke murid sampai diverifikasi.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">Paket tersusun</p>
                    {paketnya.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-400">
                        Belum ada. Tekan &ldquo;Susun paket&rdquo; setelah butirnya siap.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {paketnya.map((p) => (
                          <li key={p.id}>
                            {p.jenis === "ujian"
                              ? "Ujian"
                              : `C${p.level_bloom ?? p.nomor}`}:{" "}
                            <span className="font-medium">
                              {p.paket_topik_item[0]?.count ?? 0}
                            </span>{" "}
                            butir
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {belumDibuka.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">Topik lain di peta</h2>
          <p className="mt-1 text-xs text-gray-500">
            Ada di peta kompetensi tapi belum dibuka untuk murid dan belum punya butir. Ini rencana
            jangka panjang Learning Progression, bukan pekerjaan yang tertinggal.
          </p>

          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow ring-1 ring-gray-900/5">
            {belumDibuka.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{t.id}</span> — {t.nama}
                  </p>
                  <p className="text-xs text-gray-400">Kelas {t.jenjang_kelas}</p>
                </div>
                <TombolAktif topikId={t.id} aktif={false} punyaPaket={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
