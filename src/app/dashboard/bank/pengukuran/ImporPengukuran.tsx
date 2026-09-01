"use client";

import { useState } from "react";
import { ImportPanel } from "../ImportDialog";

/**
 * Impor naskah pilot, tanpa pertanyaan bab.
 *
 * Dialog impor di Bank Soal menuntut bab kurikulum dipilih lebih dulu, dan di
 * sana itu benar: butir latihan bebas memang disajikan lewat bab. Untuk butir
 * bertopik, bab itu diabaikan sepenuhnya sejak migrasi tera 148 — jadi
 * menanyakannya di halaman ini berarti menuntut jawaban yang tidak akan dipakai,
 * dan pertanyaan semacam itu mengajari orang bahwa isian di layar boleh diisi
 * asal-asalan.
 *
 * Panelnya sama persis dengan yang di Bank Soal; yang berbeda cuma `groupId`
 * null, yang membuatnya menolak butir tanpa topik alih-alih menolak butir tanpa
 * bab.
 */
export default function ImporPengukuran() {
  const [buka, setBuka] = useState(false);

  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
      >
        Impor naskah soal
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Impor butir pengukuran</p>
        <button
          type="button"
          onClick={() => setBuka(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          Tutup
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Tiap butir wajib membawa <code>topik</code> (mis. <code>D-01</code>) dan{" "}
        <code>paket</code> (<code>latihan</code> atau <code>ujian</code>). Butir tanpa topik
        diimpor dari halaman Bank Soal, bukan di sini.
      </p>
      <ImportPanel groupId={null} />
    </div>
  );
}
