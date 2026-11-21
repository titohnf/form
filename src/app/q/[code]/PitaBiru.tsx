import type { ReactNode } from "react";

/**
 * Pita biru di bagian atas tampilan TKA: logo Tera dan nama aplikasi di kiri,
 * isi bebas (nama peserta) di kanan. Dipakai bersama oleh halaman masuk dan
 * halaman pengerjaan supaya keduanya tampak sebagai satu aplikasi.
 */
export default function PitaBiru({
  kanan,
  tengah,
  kelas = "",
  subjudul = "TRY OUT TKA",
}: {
  kanan?: ReactNode;
  /** Isi di tengah pita (sisa waktu). Hanya tampil di layar lebar; di layar kecil tidak ada tempatnya. */
  tengah?: ReactNode;
  /** Baris di bawah "BIMBEL TERA": judul paket di halaman soal, "TRY OUT TKA" di halaman masuk. */
  subjudul?: string;
  /** Padding bawah tambahan, untuk halaman yang kartunya menumpang di atas pita. */
  kelas?: string;
}) {
  return (
    <header
      className={`relative shrink-0 overflow-hidden bg-gradient-to-r from-[#1b4f94] via-[#2a6ab5] to-[#1b4f94] px-4 pt-3 text-white sm:px-10 sm:pt-4 ${kelas || "pb-3 sm:pb-4"}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-10 -top-24 h-64 w-96 rotate-12 bg-white/10 [clip-path:polygon(0_0,100%_0,60%_100%,0_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-80 -rotate-12 bg-black/10 [clip-path:polygon(40%_0,100%_0,100%_100%,0_100%)]"
      />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo-tera.png`}
            alt="Bimbel Tera"
            className="h-10 w-10 shrink-0 rounded-full bg-white p-1.5 sm:h-12 sm:w-12"
          />
          <div className="min-w-0 leading-tight">
            <p className="text-base font-bold tracking-wide sm:text-lg">BIMBEL TERA</p>
            <p className="truncate text-xs text-blue-100 sm:text-sm" title={subjudul}>
              {subjudul}
            </p>
          </div>
        </div>
        {tengah && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            {tengah}
          </div>
        )}
        {kanan}
      </div>
    </header>
  );
}
