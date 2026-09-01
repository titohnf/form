"use client";

import { useActionState } from "react";
import { susunPaket } from "./actions";

/**
 * Tombol menyusun paket satu topik, beserta kabar hasilnya.
 *
 * Kabarnya ditampilkan, bukan cuma halaman yang menyegarkan diam-diam: hasil
 * yang paling sering terjadi di awal pilot adalah "belum ada butir yang bisa
 * dipaketkan", dan tanpa kalimat itu tombolnya terlihat seperti tidak bekerja
 * padahal ia bekerja dan menemukan bank soalnya kosong.
 */
export default function TombolSusun({ topikId }: { topikId: string }) {
  const [pesan, aksi, menunggu] = useActionState(susunPaket, null);

  return (
    <form action={aksi} className="flex items-center gap-3">
      <input type="hidden" name="topikId" value={topikId} />
      <button
        type="submit"
        disabled={menunggu}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {menunggu ? "Menyusun…" : "Susun paket"}
      </button>
      {pesan && (
        <span aria-live="polite" className="text-xs text-gray-500">
          {pesan}
        </span>
      )}
    </form>
  );
}
