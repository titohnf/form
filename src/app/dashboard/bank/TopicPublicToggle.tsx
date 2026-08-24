"use client";

import { useTransition } from "react";
import { setTopicPublic } from "./actions";

/**
 * Membuka atau menutup seluruh soal satu topik untuk pelanggan langganan Tera.
 *
 * Duduk di dalam badan topik, bukan di `<summary>`-nya: tombol di dalam summary
 * ikut membuka-tutup `<details>` saat diklik, dan mencegahnya menuntut
 * penanganan event yang lebih mudah salah daripada berguna.
 *
 * Tidak ada konfirmasi. Yang dilakukannya bisa dibatalkan dengan tombol
 * sebelahnya, dan hitungan di kepala topik langsung menunjukkan hasilnya.
 */
export default function TopicPublicToggle({
  groupId,
  total,
  publik,
}: {
  groupId: string;
  total: number;
  publik: number;
}) {
  const [pending, start] = useTransition();
  const semua = publik === total;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <span className="text-gray-500">
        {publik === 0
          ? "Belum ada soal topik ini yang terbuka untuk langganan."
          : `${publik} dari ${total} soal terbuka untuk langganan.`}
      </span>
      <button
        type="button"
        disabled={pending || semua}
        onClick={() => start(() => void setTopicPublic(groupId, true))}
        className="ml-auto font-medium text-green-700 disabled:opacity-40"
      >
        Buka semua
      </button>
      <button
        type="button"
        disabled={pending || publik === 0}
        onClick={() => start(() => void setTopicPublic(groupId, false))}
        className="font-medium text-gray-500 disabled:opacity-40"
      >
        Tutup semua
      </button>
    </div>
  );
}
