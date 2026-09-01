"use client";

import { useActionState } from "react";
import { setAktifTopik } from "./actions";

/**
 * Saklar buka/tutup sebuah topik untuk murid.
 *
 * Kalimat peringatannya muncul SEBELUM tombol ditekan, bukan sesudah: membuka
 * topik yang belum punya paket berisi berarti memasang pintu yang di baliknya
 * kosong, dan anak yang mengetuknya menemukan layar yang terbaca seperti
 * aplikasi rusak. Aksinya sendiri tidak melarang — ada urutan kerja yang sah di
 * mana topik dibuka lebih dulu lalu diisi — jadi yang bekerja di sini
 * keterangan, bukan larangan.
 */
export default function TombolAktif({
  topikId,
  aktif,
  punyaPaket,
}: {
  topikId: string;
  aktif: boolean;
  /** Sudah punya paket berisi. Menentukan peringatan, bukan boleh-tidaknya. */
  punyaPaket: boolean;
}) {
  const [pesan, aksi, menunggu] = useActionState(setAktifTopik, null);

  return (
    <form action={aksi} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="topikId" value={topikId} />
      <input type="hidden" name="aktif" value={aktif ? "0" : "1"} />
      <button
        type="submit"
        disabled={menunggu}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          aktif
            ? "border-slate-200 text-gray-600 hover:bg-slate-50"
            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
        }`}
      >
        {menunggu ? "Menyimpan…" : aktif ? "Tutup dari murid" : "Buka untuk murid"}
      </button>

      {!aktif && !punyaPaket && (
        <span className="text-xs text-amber-600">
          Belum ada paket berisi — kalau dibuka sekarang, murid melihat topik tanpa isi.
        </span>
      )}

      {pesan && (
        <span aria-live="polite" className="text-xs text-gray-500">
          {pesan}
        </span>
      )}
    </form>
  );
}
