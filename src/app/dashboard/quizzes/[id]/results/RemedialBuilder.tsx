"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createRemedialFromQuiz } from "./actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Merakit…" : "Buat Remedial"}
    </button>
  );
}

/**
 * Merakit paket remedial dari soal yang paling banyak dijawab salah.
 *
 * Ambangnya bisa diubah dan jumlah soal yang lolos dihitung langsung saat
 * diketik — tanpa itu tutor menekan tombol tanpa tahu ia akan mendapat tiga
 * soal atau tiga puluh.
 */
export default function RemedialBuilder({
  quizId,
  accuracies,
}: {
  quizId: string;
  /** Ketepatan tiap soal yang sudah punya jawaban dinilai. */
  accuracies: number[];
}) {
  const [threshold, setThreshold] = useState(70);
  const count = accuracies.filter((a) => a < threshold).length;
  const action = createRemedialFromQuiz.bind(null, quizId);

  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-gray-500">Buat Remedial</h2>
      <p className="mt-1 text-sm text-gray-500">
        Soal yang ketepatannya di bawah ambang disalin ke paket Remedial baru, menempel ke sesi dan
        kelas yang sama, dengan urutan soal dan pilihan diacak.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Ketepatan di bawah
          <input
            type="number"
            name="threshold"
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          %
        </label>

        <span className={`text-sm ${count === 0 ? "text-amber-700" : "text-gray-500"}`}>
          {count === 0
            ? "Tidak ada soal yang memenuhi — tidak ada yang perlu diremedialkan."
            : `${count} soal akan disalin.`}
        </span>

        <Submit disabled={count === 0} />
      </div>
    </form>
  );
}
