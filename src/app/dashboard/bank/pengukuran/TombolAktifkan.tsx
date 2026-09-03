"use client";

import { useActionState, useState } from "react";
import { aktifkanSemuaDraf } from "./actions";

/**
 * Tombol mengaktifkan seluruh butir draf sebuah topik.
 *
 * BERTANYA DULU, dan ini satu-satunya tombol di halaman ini yang bertanya.
 * Bedanya dengan "Susun paket": menyusun paket bisa diulang dan tidak mengubah
 * apa yang dilihat murid, sedangkan tombol ini adalah detik ketika sebuah
 * naskah mulai dikerjakan anak-anak. Yang perlu dipastikan bukan "apakah kamu
 * yakin" secara umum, melainkan bahwa orangnya tahu BERAPA butir yang akan
 * hidup sekaligus — angka itu yang membedakan mengaktifkan satu perbaikan kecil
 * dari mengaktifkan seluruh topik.
 */
export default function TombolAktifkan({
  topikId,
  jumlahDraf,
}: {
  topikId: string;
  jumlahDraf: number;
}) {
  const [pesan, aksi, menunggu] = useActionState(aktifkanSemuaDraf, null);
  const [bertanya, setBertanya] = useState(false);

  if (jumlahDraf === 0) return null;

  return (
    <form action={aksi} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topikId" value={topikId} />
      {bertanya ? (
        <>
          <span className="text-sm text-gray-700">
            Aktifkan {jumlahDraf} butir draf? Sesudah ini murid bisa mengerjakannya.
          </span>
          <button
            type="submit"
            disabled={menunggu}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {menunggu ? "Mengaktifkan…" : "Ya, aktifkan"}
          </button>
          <button
            type="button"
            onClick={() => setBertanya(false)}
            className="text-sm text-gray-500 hover:underline"
          >
            Batal
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setBertanya(true)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
        >
          Aktifkan {jumlahDraf} butir draf
        </button>
      )}
      {pesan && (
        <span aria-live="polite" className="text-xs text-gray-500">
          {pesan}
        </span>
      )}
    </form>
  );
}
