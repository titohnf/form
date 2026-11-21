"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Isian kode peserta di /hasil; menuju /hasil/<kode>. */
export default function FormKode() {
  const router = useRouter();
  const [kode, setKode] = useState("");
  const bersih = kode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (bersih) router.push(`/hasil/${bersih}`);
      }}
    >
      <div>
        <label htmlFor="kode-hasil" className="text-xs font-bold text-gray-800">
          Kode Peserta:
        </label>
        <input
          id="kode-hasil"
          value={kode}
          onChange={(e) => setKode(e.target.value.toUpperCase())}
          placeholder="Contoh: Q6G484"
          autoComplete="off"
          autoCapitalize="characters"
          className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm tracking-widest shadow-sm outline-none focus:border-blue-600"
        />
      </div>
      <button
        type="submit"
        disabled={!bersih}
        className="w-full rounded-lg bg-gradient-to-r from-[#1b4f94] to-[#2a6ab5] px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-95 disabled:opacity-50"
      >
        Lihat Hasil
      </button>
    </form>
  );
}
