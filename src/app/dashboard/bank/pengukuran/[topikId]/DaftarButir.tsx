"use client";

import { useMemo, useState } from "react";
import type { QuestionBankItem } from "@/lib/types";
import { BLOOM_LEVELS } from "@/lib/bloom";
import { LABEL_VERIFIKASI, type StatusVerifikasi } from "@/lib/verifikasi";
import BankItem from "../../BankItem";

/**
 * Daftar butir sebuah topik pengukuran, dengan saringan.
 *
 * KENAPA ADA SARINGAN. Satu topik yang siap membawa 54 butir, dan tiap kartu
 * mencetak pertanyaan beserta seluruh pilihan jawabannya. Tanpa saringan,
 * "cari soal yang kuncinya salah" berarti menggulir belasan layar sambil
 * mengingat sudah sampai mana — dan itu persis keluhan yang membuat halaman ini
 * dibuat.
 *
 * DI BROWSER, BUKAN DI ALAMAT. Saringan di sini adalah cara MEMBACA satu
 * halaman, bukan cara menuju halaman yang berbeda: yang dicari orang berubah
 * beberapa kali dalam satu menit, dan menaruhnya di `?cari=` berarti satu
 * perjalanan ke server untuk tiap huruf yang diketik. Yang tetap punya alamat
 * adalah topiknya — itu yang pantas dibagikan dan dibuka ulang.
 *
 * PENCARIANNYA MENYENTUH PERTANYAAN DAN PILIHAN JAWABAN. Bukan cuma
 * pertanyaannya: yang paling sering dicari penulis soal justru angka yang
 * muncul di sebuah distraktor ("mana soal yang punya opsi -15?"), dan
 * pertanyaan sebuah soal pilihan ganda kerap tidak memuat satu angka pun.
 */
const SEMUA = "semua" as const;

/** Ambang kolam probe: di bawah ini `retest_buka_sesi` (migrasi tera 164) tidak pernah membuka sesi. */
const MINIMAL_PROBE = 3;

interface Kolam {
  key: "latihan" | "ujian" | "probe";
  judul: string;
  arti: string;
}

const KOLAM: Kolam[] = [
  {
    key: "latihan",
    judul: "Latihan",
    arti: "Paket bertingkat C1–C3 yang dikerjakan berulang sampai tuntas.",
  },
  {
    key: "ujian",
    judul: "Ujian",
    arti: "Satu putaran, tanpa retry. Tidak boleh beririsan dengan butir latihan.",
  },
  {
    key: "probe",
    judul: "Probe",
    arti:
      "Retest berkala dan pemanasan sesudah jeda panjang. C2–C3, berotasi, dan " +
      "tidak boleh jadi anggota paket mana pun.",
  },
];

function teksButir(b: QuestionBankItem): string {
  const opsi = b.options && "choices" in b.options ? (b.options.choices as string[]) : [];
  return [b.prompt, ...opsi].join(" ").toLowerCase();
}

export default function DaftarButir({
  butir,
  topikId,
}: {
  butir: QuestionBankItem[];
  topikId: string;
}) {
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState<StatusVerifikasi | typeof SEMUA>(SEMUA);

  // Dihitung dari SELURUH butir, bukan dari hasil saringan: sebuah cacah yang
  // ikut menyusut saat orang mengetik berhenti menjawab "berapa yang masih
  // draf" dan mulai menjawab "berapa yang masih draf DAN cocok dengan yang
  // sedang saya ketik" — pertanyaan yang tidak ditanyakan siapa pun.
  const cacahStatus = useMemo(() => {
    const c: Partial<Record<StatusVerifikasi, number>> = {};
    for (const b of butir) {
      const s = (b.status_verifikasi ?? "draf") as StatusVerifikasi;
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [butir]);

  const terlihat = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return butir.filter((b) => {
      if (status !== SEMUA && (b.status_verifikasi ?? "draf") !== status) return false;
      if (q && !teksButir(b).includes(q)) return false;
      return true;
    });
  }, [butir, cari, status]);

  const probeAktif = butir.filter(
    (b) => b.peruntukan === "probe" && b.status_verifikasi === "aktif",
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari di pertanyaan atau pilihan jawaban…"
          className="min-w-64 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusVerifikasi | typeof SEMUA)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        >
          <option value={SEMUA}>Semua status ({butir.length})</option>
          {(Object.keys(LABEL_VERIFIKASI) as StatusVerifikasi[]).map((s) => (
            <option key={s} value={s} disabled={!cacahStatus[s]}>
              {LABEL_VERIFIKASI[s]} ({cacahStatus[s] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {/* Kolam probe yang tipis bukan sekadar "belum lengkap" — ia keadaan yang
          membuat SELURUH retest topik ini diam. `retest_buka_sesi` menolak
          membuka sesi di bawah tiga butir aktif, dan penolakan itu tidak
          meninggalkan pesan apa pun di layar murid. Disebut di sini karena
          inilah satu-satunya halaman yang bisa mengetahuinya. */}
      {butir.some((b) => b.peruntukan === "probe") && probeAktif < MINIMAL_PROBE && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
          Kolam probe baru berisi {probeAktif} butir aktif. Di bawah {MINIMAL_PROBE}, retest dan
          pemanasan topik ini tidak akan pernah terbuka — dan murid tidak melihat pesan apa pun
          soal itu.
        </p>
      )}

      {terlihat.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Tidak ada butir yang cocok. Kosongkan pencarian atau pilih status lain.
        </p>
      ) : (
        KOLAM.map(({ key, judul, arti }) => {
          // `peruntukan` boleh null untuk butir yang ditulis sebelum kolomnya
          // ada (migrasi tera 142), dan yang lama semuanya butir latihan.
          const miliknya = terlihat.filter((b) => (b.peruntukan ?? "latihan") === key);
          if (miliknya.length === 0) return null;
          const total = butir.filter((b) => (b.peruntukan ?? "latihan") === key).length;

          return (
            <section key={key} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {judul}{" "}
                  <span className="font-normal text-gray-400">
                    · {miliknya.length === total ? `${total} butir` : `${miliknya.length} dari ${total}`}
                  </span>
                </h2>
                <p className="text-xs leading-relaxed text-gray-400">{arti}</p>
              </div>

              {BLOOM_LEVELS.map((lvl) => {
                const selevel = miliknya.filter((b) => b.bloom_level === lvl.value);
                if (selevel.length === 0) return null;
                return (
                  <div key={lvl.value} className="space-y-3">
                    <p className="text-xs font-medium text-gray-500">
                      {lvl.code} — {lvl.label}{" "}
                      <span className="text-gray-400">· {selevel.length}</span>
                    </p>
                    {selevel.map((item) => (
                      <Kartu key={item.id} item={item} topikId={topikId} />
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
                      <Kartu key={item.id} item={item} topikId={topikId} />
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

function Kartu({ item, topikId }: { item: QuestionBankItem; topikId: string }) {
  return (
    <div id={`soal-${item.id}`} className="scroll-mt-6">
      <BankItem
        item={item}
        subjects={[]}
        initialTaggedIds={[]}
        topikDariAsal
        editHref={`/dashboard/bank/soal/${item.id}?dari=pengukuran:${topikId}`}
      />
    </div>
  );
}
