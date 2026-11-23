"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PitaBiru from "./PitaBiru";

interface Student {
  id: string;
  name: string;
}

/**
 * Alur masuk ala TKA/ANBK, sebelum soal tampil: (1) halaman "Selamat Datang"
 * tempat peserta mengisi namanya, lalu (2) halaman konfirmasi yang memuat data
 * peserta dan petunjuk pengerjaan. Waktu baru berjalan setelah tombol mulai di
 * halaman kedua ditekan.
 */
export default function MasukCbt({
  judul,
  kode,
  paket,
  jumlahSoal,
  menit,
  namaAsesmen,
  namaIdentitas,
  dariMenu = false,
  penguji = false,
  students,
  studentId,
  onStudentId,
  guestName,
  onGuestName,
  error,
  onMulai,
}: {
  judul: string;
  /** Kode bagikan paket yang sedang dibuka. */
  kode: string;
  /** Paket try out TKA yang bisa dipilih; mengganti pilihan membuka paket itu. */
  paket: { kode: string; judul: string; jenjang?: string; mapel?: string }[];
  jumlahSoal: number;
  menit: number | null;
  /** Nama murid yang sudah login (penugasan asesmen); mengabaikan isian nama. */
  namaAsesmen: string | null;
  /** Nama peserta yang sudah dikenali (dari kode atau akun), untuk layar konfirmasi. */
  namaIdentitas: string | null;
  /** Peserta datang dari menu Try Out Tera (sudah dikenali): Kembali membawanya ke menu itu, bukan ke layar masuk lama. */
  dariMenu?: boolean;
  /** Akun penguji: tampilkan banner di layar konfirmasi. */
  penguji?: boolean;
  students: Student[];
  studentId: string;
  onStudentId: (id: string) => void;
  guestName: string;
  onGuestName: (nama: string) => void;
  error: string | null;
  onMulai: () => Promise<void> | void;
}) {
  const router = useRouter();
  // Paket yang sedang dibuka selalu ada di daftar, walau belum tercatat di sana.
  const daftarPaket = paket.some((p) => p.kode === kode) ? paket : [{ kode, judul }, ...paket];
  const [tahap, setTahap] = useState<"masuk" | "konfirmasi">(namaAsesmen || namaIdentitas ? "konfirmasi" : "masuk");
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const [memulai, setMemulai] = useState(false);

  // Try out terbuka (tanpa roster kelas): peserta dikenali dari kode atau akun, tidak mengetik nama.
  const pakaiIdentitas = !namaAsesmen && students.length === 0;

  const nama = namaAsesmen ?? (pakaiIdentitas ? namaIdentitas ?? "" : students.length > 0 ? students.find((s) => s.id === studentId)?.name ?? "" : guestName.trim());

  /**
   * Layar penuh baru diminta saat tombol Mulai Mengerjakan ditekan, bukan di
   * halaman Selamat Datang. Browser hanya mengizinkannya di dalam penekanan
   * tombol, dan percobaan memintanya dari tombol Lanjut ditolak browser
   * ("not granted"). Perangkat yang tidak mendukungnya (iPhone) dilewati.
   */
  function mintaLayarPenuh() {
    try {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* tidak didukung */
    }
  }

  function lanjut() {
    if (!nama) {
      setGalatLokal(students.length > 0 ? "Pilih namamu dulu." : "Nama wajib diisi.");
      return;
    }
    setGalatLokal(null);
    setTahap("konfirmasi");
  }

  /** Kembali ke menu Try Out Tera (halaman asal), bukan ke layar masuk kode + pilih paket yang sudah tidak dipakai. */
  function kembaliKeMenu() {
    try {
      const asal = document.referrer ? new URL(document.referrer) : null;
      if (asal && asal.origin === window.location.origin && !asal.pathname.startsWith("/tryout/q")) {
        window.location.href = asal.pathname + asal.search;
        return;
      }
    } catch {
      /* abaikan */
    }
    window.location.href = "/";
  }

  async function mulai() {
    mintaLayarPenuh();
    setMemulai(true);
    await onMulai();
    setMemulai(false);
  }

  const pesan = galatLokal ?? error;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#eef3f8]">
      <PitaBiru />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl sm:p-8">
          {tahap === "masuk" ? (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2a6ab5] text-white">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                    <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Z" />
                    <path d="M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8-7-3.8Z" />
                  </svg>
                </span>
                <h1 className="mt-3 text-xl font-semibold text-gray-900">Selamat Datang</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Isi data dan pilih paket soal yang akan dikerjakan untuk memulai try out.
                </p>
              </div>

              <form
                className="mt-6 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  lanjut();
                }}
              >
                {!pakaiIdentitas && (
                <div>
                  <label htmlFor="nama-peserta" className="text-xs font-bold text-gray-800">
                    {students.length > 0 ? "Nama Peserta:" : "Nama Lengkap:"}
                  </label>
                  {students.length > 0 ? (
                    <select
                      id="nama-peserta"
                      value={studentId}
                      onChange={(e) => onStudentId(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-600"
                    >
                      <option value="">Pilih nama</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="nama-peserta"
                      value={guestName}
                      onChange={(e) => onGuestName(e.target.value)}
                      placeholder="Tulis nama lengkap"
                      autoComplete="name"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-600"
                    />
                  )}
                </div>

                )}

                <div>
                  <label htmlFor="paket-soal" className="text-xs font-bold text-gray-800">
                    Paket Soal:
                  </label>
                  <select
                    id="paket-soal"
                    value={kode}
                    onChange={(e) => {
                      if (e.target.value !== kode) router.push(`/q/${e.target.value}`);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-600"
                  >
                    {[...new Set(daftarPaket.map((p) => p.jenjang ?? ""))].map((j) => {
                      const isi = daftarPaket.filter((p) => (p.jenjang ?? "") === j);
                      const opsi = isi.map((p) => (
                        <option key={p.kode} value={p.kode}>
                          {p.judul}
                        </option>
                      ));
                      // Dikelompokkan per jenjang supaya tidak salah memilih paket jenjang lain.
                      return j ? (
                        <optgroup key={j} label={`Try Out ${j}`}>
                          {opsi}
                        </optgroup>
                      ) : (
                        opsi
                      );
                    })}
                  </select>
                </div>

                {pesan && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pesan}</p>}

                <button
                  type="submit"
                  className="mt-1 w-full disabled:opacity-50 rounded-lg bg-gradient-to-r from-[#1b4f94] to-[#2a6ab5] px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-95"
                >
                  Lanjut
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900">Konfirmasi Data Peserta</h1>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Nama</dt>
                <dd className="font-medium text-gray-900">{nama}</dd>
                <dt className="text-gray-500">Paket</dt>
                <dd className="font-medium text-gray-900">{judul}</dd>
                <dt className="text-gray-500">Jumlah soal</dt>
                <dd className="font-medium text-gray-900">{jumlahSoal}</dd>
                {menit && (
                  <>
                    <dt className="text-gray-500">Waktu</dt>
                    <dd className="font-medium text-gray-900">{menit} menit</dd>
                  </>
                )}
              </dl>

              <div className="mt-5 rounded bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Petunjuk pengerjaan</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">
                  <li>Soal tampil satu per satu. Kamu bisa kembali ke soal sebelumnya.</li>
                  <li>Tandai soal yang masih ragu-ragu dengan tombol Ragu-ragu.</li>
                  <li>Buka Daftar soal untuk melihat soal yang sudah dan belum dijawab.</li>
                  <li>Tekan sebuah gambar untuk memperbesarnya. Ukuran huruf soal bisa diubah dengan tombol A.</li>
                  {menit && <li>Waktu berjalan setelah kamu menekan tombol Mulai. Jawaban terkirim otomatis saat waktu habis.</li>}
                  <li>Jangan menutup atau memuat ulang halaman, dan jangan berpindah tab atau aplikasi selama mengerjakan. Ujian berjalan di layar penuh, dan setiap kali kamu meninggalkan halaman, kejadiannya dicatat dan dapat dilihat oleh tutor.</li>
                </ul>
              </div>

              {penguji && (
                <p role="note" className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                  <strong className="font-semibold">Ini akun penguji.</strong> Jadwal buka dan tutup tidak berlaku untukmu, supaya kamu bisa melihat soal dan menguji kunci jawaban. Jawabanmu hanya untuk menguji dan tidak perlu disimpan: jangan dihitung sebagai nilai atau pengerjaan siswa.
                </p>
              )}

              {pesan && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pesan}</p>}

              <div className="mt-5 flex gap-2">
                {!namaAsesmen && (
                  <button
                    type="button"
                    onClick={dariMenu ? kembaliKeMenu : () => setTahap("masuk")}
                    disabled={memulai}
                    className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Kembali
                  </button>
                )}
                <button
                  type="button"
                  onClick={mulai}
                  disabled={memulai}
                  className="flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {memulai ? "Memulai…" : "Mulai Mengerjakan"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
      <footer className="pb-4 text-center">
        <span className="rounded-full bg-white px-4 py-1.5 text-xs text-gray-600 shadow">© Bimbel Tera</span>
      </footer>
    </div>
  );
}
