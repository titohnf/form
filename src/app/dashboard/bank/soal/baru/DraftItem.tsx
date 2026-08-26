"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Question, QuestionPatch } from "@/lib/types";
import QuestionEditor from "../../../quizzes/[id]/edit/QuestionEditor";
import { simpanSoalBaru } from "../../actions";

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
 */
export default function DraftItem({
  groupId,
  judul,
  kembali,
}: {
  groupId: string;
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
      await simpanSoalBaru(groupId, draf.current);
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
