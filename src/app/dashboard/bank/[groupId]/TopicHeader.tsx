"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Kepala halaman topik, beserta bar tipis yang menggantikannya saat digulung.
 *
 * Keduanya elemen terpisah, dan itu yang penting: kartunya tetap di alur
 * halaman dari awal sampai akhir — ia sekadar tergulung ke atas seperti isi
 * lain — sedangkan bar tipisnya `fixed` dan tidak pernah ikut menghitung tinggi
 * halaman. Versi sebelumnya mencoba mengubah kartu ITU SENDIRI menjadi bar,
 * yang berarti tempat yang ditinggalkannya harus diganjal setinggi yang diukur
 * lebih dulu; angka ukur itu bisa basi atau bahkan belum sempat ada (halaman
 * yang dibuka dalam keadaan sudah tergulung, misalnya sepulang dari halaman
 * soal), dan yang tersisa adalah ruang kosong di ujung daftar.
 */
export default function TopicHeader({
  warna,
  topic,
  keterangan,
  jumlah,
  aksiRingkas,
  children,
}: {
  warna: string;
  topic: string;
  /** Mapel, kelas, tema — yang ada saja. */
  keterangan: string[];
  jumlah: number;
  /** Tombol untuk bar tipis; instans tersendiri, bukan yang di kartu. */
  aksiRingkas?: React.ReactNode;
  /** Tombol-tombolnya di kartu; panel yang terbuka boleh `w-full`. */
  children: React.ReactNode;
}) {
  const [nempel, setNempel] = useState(false);
  const penanda = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = penanda.current;
    if (!el) return;
    const pengamat = new IntersectionObserver(([masuk]) => setNempel(!masuk.isIntersecting));
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, []);

  return (
    <>
      <header
        className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-5 text-white/80 ${warna}`}
      >
        <div className="min-w-0 flex-1">
          <Link
            href="/dashboard/bank"
            className="text-xs text-white/70 hover:text-white hover:underline"
          >
            ← Bank Soal
          </Link>

          {/* Judul panjang dibiarkan melipat: nama topik Tera panjang-panjang
              dan yang lebih dulu terpotong justru ekor yang membedakannya dari
              topik sebelah. */}
          <h1 className="mt-1 text-xl font-semibold text-white">{topic}</h1>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
            {keterangan
              .map((bagian) => <span key={bagian}>{bagian}</span>)
              .flatMap((el, i) => (i === 0 ? [el] : [<Pemisah key={`p${i}`} />, el]))}
            <Pemisah />
            <span>{jumlah} soal</span>
          </p>
        </div>

        {children}
      </header>

      {/* Penanda setinggi satu piksel DI BAWAH kartu, bukan di atasnya: bar
          tipisnya baru muncul setelah kartu benar-benar habis tergulung. Di
          atas kartu, penanda itu keluar layar pada piksel pertama gulungan —
          barnya muncul sementara kartunya masih terpampang penuh, dan yang
          terlihat adalah dua kepala halaman menumpuk. */}
      <div ref={penanda} aria-hidden className="h-px" />

      {nempel && (
        <div
          className={`fixed top-14 right-0 left-60 z-30 flex items-center gap-3 px-6 py-2 shadow-lg ${warna}`}
        >
          <Link
            href="/dashboard/bank"
            title="Kembali ke Bank Soal"
            className="shrink-0 text-lg leading-none text-white/70 hover:text-white"
          >
            ←
          </Link>

          {/* Di bar setipis ini judulnya dipotong: ia cuma pengingat sedang di
              mana, dan satu baris yang tetap tipis lebih berharga daripada nama
              yang utuh. */}
          <span className="truncate text-sm font-semibold text-white">{topic}</span>

          <span className="hidden shrink-0 items-center gap-2 text-xs text-white/70 sm:flex">
            <Pemisah />
            {keterangan.join(" · ")}
            <Pemisah />
            {jumlah} soal
          </span>

          {aksiRingkas && <span className="ml-auto shrink-0">{aksiRingkas}</span>}
        </div>
      )}
    </>
  );
}

/** Titik pemisah antar keterangan. */
function Pemisah() {
  return (
    <span aria-hidden className="text-white/40">
      ·
    </span>
  );
}
