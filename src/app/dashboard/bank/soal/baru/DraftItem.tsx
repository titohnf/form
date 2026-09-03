"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Question, QuestionPatch } from "@/lib/types";
import { PERUNTUKAN, type Peruntukan } from "@/lib/metadata-pengukuran";
import QuestionEditor from "../../../quizzes/[id]/edit/QuestionEditor";
import { simpanButirPengukuranBaru, simpanSoalBaru } from "../../actions";

/** Soal kosong yang belum pernah menyentuh database. */
const KOSONG: Question = {
  id: "draf",
  quiz_id: "",
  type: "mcq_single",
  prompt: "",
  options: { choices: ["", ""] },
  correct_answer: "",
  weight: 1,
  order_index: 0,
  branching: null,
  explanation: null,
  bloom_level: null,
  stimulus_images: [],
};

/**
 * Draf soal: disunting seperti soal biasa, tapi belum ada barisnya di bank.
 *
 * `QuestionEditor` tetap autosave seperti di mana pun ia dipakai — bedanya
 * tujuan tulisannya di sini cuma ingatan halaman ini, bukan server. Itu
 * disengaja: editornya tidak perlu tahu ia sedang menyunting sesuatu yang belum
 * ada, dan draf ini ikut menikmati hal yang sama dengan soal tersimpan, yaitu
 * ketikan yang tidak hilang saat tipenya diganti atau pilihannya ditambah.
 *
 * Yang tidak ada di sini: tag topik, bobot, dan tombol hapus. Topiknya sudah
 * ditentukan lewat tombol yang membawa orang kemari, bobot baru punya arti di
 * dalam kuis, dan sesuatu yang belum tersimpan tidak bisa dihapus — cukup
 * ditinggalkan.
 *
 * DUA TUJUAN, SATU LAYAR. Soal bisa mendarat di bab kurikulum atau di topik
 * peta kompetensi, dan keduanya dipisah tajam oleh database sejak migrasi tera
 * 148 — satu butir tidak boleh punya keduanya. Yang membedakan cuma tujuannya;
 * menulisnya sama saja, jadi menggandakan layar ini demi perbedaan itu berarti
 * dua editor yang suatu hari akan berbeda perilaku.
 */
export default function DraftItem({
  tujuan,
  judul,
  kembali,
}: {
  /** Bab kurikulum, atau topik pengukuran. Tepat satu — tidak pernah keduanya. */
  tujuan: { jenis: "grup"; id: string } | { jenis: "topik"; id: string };
  /** Label kartunya: jejak topik tempat soal ini akan mendarat. */
  judul: string;
  kembali: string;
}) {
  const router = useRouter();
  // Draf disimpan di ref, bukan state: tidak ada satu pun yang dirender darinya
  // — editornya memegang tampilannya sendiri — jadi menyimpannya sebagai state
  // hanya memicu render ulang di tiap jeda autosave tanpa mengubah apa pun.
  const draf = useRef<QuestionPatch>({
    type: KOSONG.type,
    prompt: KOSONG.prompt,
    weight: KOSONG.weight,
    options: KOSONG.options,
    correct_answer: KOSONG.correct_answer,
    explanation: null,
    branching: null,
    bloom_level: null,
  });
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  // Kolam butir pengukuran. Bawaannya latihan, dan itu disebut di layar alih-
  // alih dibiarkan kosong: `semai_paket_topik` memperlakukan butir tanpa kolam
  // sebagai butir latihan, jadi "belum diisi" dan "latihan" berakibat sama —
  // bedanya yang satu terbaca, yang satu lagi tidak.
  const [peruntukan, setPeruntukan] = useState<Peruntukan>("latihan");
  const tulisSekarang = useRef<(() => Promise<void>) | null>(null);

  async function simpan() {
    setGalat(null);
    // Ketikan terakhir mungkin baru berumur seperempat detik dan masih
    // mengantre di dalam editor; tanpa ini yang tersimpan versi sebelumnya.
    await tulisSekarang.current?.();
    setMenyimpan(true);
    try {
      // Divalidasi setelah `flush`, bukan lewat tombol yang dimatikan: draf
      // baru masuk ke state ini setelah jeda autosave, jadi tombol yang mati
      // sampai state itu tiba akan menolak klik pada soal yang sudah ditulis.
      if (!draf.current.prompt.trim()) {
        setGalat("Pertanyaannya masih kosong — tulis dulu sebelum menyimpan.");
        setMenyimpan(false);
        return;
      }
      if (tujuan.jenis === "topik") {
        await simpanButirPengukuranBaru(tujuan.id, draf.current, peruntukan);
      } else {
        await simpanSoalBaru(tujuan.id, draf.current);
      }
      router.push(kembali);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan soal.");
      setMenyimpan(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <QuestionEditor
        question={KOSONG}
        label={judul}
        save={async (patch) => {
          draf.current = patch;
        }}
        flushRef={tulisSekarang}
        tanpaBobot
        tanpaPenandaSimpan
      />

      {/* Kolamnya di dekat tombol Simpan, bukan di atas editornya: ia keputusan
          terakhir sebelum butirnya mendarat, dan satu-satunya di layar ini yang
          bukan tentang isi soalnya. */}
      {tujuan.jenis === "topik" && (
        <label className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-xs font-medium text-slate-700">Kolam</span>
          <select
            value={peruntukan}
            onChange={(e) => setPeruntukan(e.target.value as Peruntukan)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            {PERUNTUKAN.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {PERUNTUKAN.find((k) => k.value === peruntukan)?.arti}
          </span>
        </label>
      )}

      {galat && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{galat}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={simpan}
          disabled={menyimpan}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {menyimpan ? "Menyimpan…" : "Simpan soal"}
        </button>
        <button
          type="button"
          onClick={() => router.push(kembali)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
