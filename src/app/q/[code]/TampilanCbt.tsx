"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Question } from "@/lib/types";
import QuestionInput from "@/lib/QuestionInput";
import PitaBiru from "./PitaBiru";

/**
 * Tampilan pengerjaan ala TKA/ANBK: pita biru dengan logo dan nama peserta,
 * kartu putih berisi satu soal per layar, sisa waktu, daftar nomor soal
 * berwarna, tombol ragu-ragu, dan ukuran font. Mengikuti simulasi Pusmendik
 * (pusmendik.kemendikdasmen.go.id/tka/simulasi_tka), dengan logo Tera.
 *
 * Komponen ini hanya menyajikan. Jawaban, penyimpanan, dan pengiriman tetap
 * milik `QuizForm`, supaya jalur yang menilai dan menyimpan jawaban sama persis
 * dengan tampilan lain.
 */

/** Apakah sebuah jawaban dianggap sudah diisi (untuk warna nomor di daftar soal). */
export function terjawab(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(terjawab);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(terjawab);
  return true; // boolean dan angka, termasuk false dan 0
}

// Soal di layar murid bawaannya 14px, terlalu kecil untuk ujian: bawaan di sini
// sudah diperbesar (sedang), dan ada dua tingkat lagi di atasnya.
const UKURAN = [
  { label: "A", zoom: 1, judul: "Font kecil" },
  { label: "A", zoom: 1.3, judul: "Font sedang" },
  { label: "A", zoom: 1.6, judul: "Font besar" },
  { label: "A", zoom: 2, judul: "Font sangat besar" },
] as const;
const UKURAN_BAWAAN = 1;
const KUNCI_UKURAN = "cbt:ukuran";

function format(detik: number): string {
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  const d = detik % 60;
  return [j, m, d].map((n) => String(n).padStart(2, "0")).join(":");
}

export interface KondisiCbt {
  nomor: number;
  ragu: string[];
}

/** Ikon kotak-kotak untuk tombol Daftar soal. */
function IkonKotak() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Kotak sisa waktu. `gelap`: di atas pita biru. Merah di 5 menit terakhir. */
function KotakWaktu({ sisa, gelap }: { sisa: number; gelap: boolean }) {
  const mendesak = sisa <= 300;
  const warna = mendesak
    ? "bg-red-600 text-white ring-1 ring-red-300"
    : gelap
      ? "bg-white/15 text-white ring-1 ring-white/30"
      : "bg-slate-100 text-slate-700";
  return (
    <div role="timer" aria-label="Sisa waktu" className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm tabular-nums ${warna}`}>
      <IkonJam />
      <span className="text-xs">Sisa waktu</span>
      <b className="text-base">{format(sisa)}</b>
    </div>
  );
}

/** Ikon jam untuk kotak sisa waktu. */
function IkonJam() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ikon topi wisuda untuk kotak nama peserta. */
function IkonWisuda() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Z" />
      <path d="M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8-7-3.8Z" />
    </svg>
  );
}

export default function TampilanCbt({
  judul,
  nama,
  questions,
  responses,
  onAnswer,
  onSubmit,
  submitting,
  deadline,
  skew,
  kondisiAwal,
  onKondisi,
}: {
  /** Judul paket, tampil di kanan baris kedua kartu. */
  judul: string;
  /** Nama peserta, tampil di kanan pita biru. */
  nama: string;
  questions: Question[];
  responses: Record<string, unknown>;
  onAnswer: (questionId: string, value: unknown, index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** Epoch ms batas waktu menurut jam server, atau null kalau tanpa batas. */
  deadline: number | null;
  /** Selisih jam server dikurangi jam perangkat (ms). */
  skew: number;
  kondisiAwal: KondisiCbt;
  /** Dipanggil tiap nomor atau tanda ragu berubah, untuk dipulihkan kalau halaman dimuat ulang. */
  onKondisi: (k: KondisiCbt) => void;
}) {
  const [nomor, setNomor] = useState(Math.min(kondisiAwal.nomor, questions.length - 1));
  const [ragu, setRagu] = useState<Set<string>>(new Set(kondisiAwal.ragu));
  const [daftarTerbuka, setDaftarTerbuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [ukuran, setUkuranState] = useState(UKURAN_BAWAAN);
  // Pilihan ukuran font diingat di perangkat ini, jadi murid yang membesarkannya
  // tidak mengulang di setiap soal maupun di percobaan berikutnya.
  useEffect(() => {
    try {
      const mentah = localStorage.getItem(KUNCI_UKURAN);
      const t = Number(mentah);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- membaca preferensi perangkat, hanya bisa setelah mount
      if (mentah !== null && Number.isInteger(t) && t >= 0 && t < UKURAN.length) setUkuranState(t);
    } catch {
      /* tanpa penyimpanan, bawaan dipakai */
    }
  }, []);
  function setUkuran(i: number) {
    setUkuranState(i);
    try {
      localStorage.setItem(KUNCI_UKURAN, String(i));
    } catch {
      /* abaikan */
    }
  }
  const [sisa, setSisa] = useState<number | null>(() =>
    deadline === null ? null : Math.max(0, Math.floor((deadline - (Date.now() + skew)) / 1000)),
  );
  const sudahKirim = useRef(false);
  const kirim = useRef(onSubmit);
  useEffect(() => {
    kirim.current = onSubmit;
  });

  // Timer. Selalu dihitung dari batas waktu server, bukan dikurangi satu per
  // detik, supaya tab yang sempat tertidur tidak membuat waktunya melambat.
  useEffect(() => {
    if (deadline === null) return;
    const tik = () => {
      const s = Math.max(0, Math.floor((deadline - (Date.now() + skew)) / 1000));
      setSisa(s);
      if (s === 0 && !sudahKirim.current) {
        sudahKirim.current = true;
        kirim.current();
      }
    };
    tik();
    const id = setInterval(tik, 1000);
    return () => clearInterval(id);
  }, [deadline, skew]);

  // Mencegah murid menutup tab tanpa sengaja di tengah ujian.
  useEffect(() => {
    const cegah = (e: BeforeUnloadEvent) => {
      if (sudahKirim.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, []);

  function pindah(ke: number) {
    const baru = Math.max(0, Math.min(questions.length - 1, ke));
    setNomor(baru);
    onKondisi({ nomor: baru, ragu: [...ragu] });
    setDaftarTerbuka(false);
  }

  function ubahRagu(id: string) {
    const baru = new Set(ragu);
    if (baru.has(id)) baru.delete(id);
    else baru.add(id);
    setRagu(baru);
    onKondisi({ nomor, ragu: [...baru] });
  }

  const soal = questions[nomor];
  const ringkasan = useMemo(() => {
    const dijawab = questions.filter((q) => terjawab(responses[q.id])).length;
    return {
      dijawab,
      kosong: questions.length - dijawab,
      ragu: questions.filter((q) => ragu.has(q.id)).length,
    };
  }, [questions, responses, ragu]);

  if (!soal) return null;
  const terakhir = nomor === questions.length - 1;
  const zoom = UKURAN[ukuran].zoom;

  // Gambar dibatasi tingginya supaya satu gambar selalu muat dalam satu layar:
  // murid tidak perlu menggulir di tengah gambar dan kehilangan konteks soal.
  // Satuan vh ikut dibagi zoom karena isi soal diperbesar dengan `zoom`.
  const gayaIsi = { zoom, ["--z" as string]: zoom } as CSSProperties;
  const kelasGambar = [
    "[&_button.cursor-zoom-in]:max-w-full",
    "[&_button.cursor-zoom-in_img]:w-auto",
    "[&_button.cursor-zoom-in_img]:max-w-full",
    "[&_button.cursor-zoom-in_img]:max-h-[calc(46vh/var(--z))]",
    // Gambar yang menjadi pilihan jawaban: empat sekaligus, jadi jauh lebih kecil
    // dan tidak melebar penuh. Menekannya tetap memperbesar.
    "[&_label_button.cursor-zoom-in]:max-w-[520px]",
    "[&_label_button.cursor-zoom-in_img]:max-h-[calc(24vh/var(--z))]",
  ].join(" ");

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-100">
      {/* Pita biru: logo di kiri, nama peserta di kanan */}
      <PitaBiru
        subjudul={judul}
        kelas="pb-14 sm:pb-16"
        tengah={sisa !== null ? <KotakWaktu sisa={sisa} gelap /> : undefined}
        kanan={
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium" title={nama}>
              {nama}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-sky-400 text-white">
              <IkonWisuda />
            </span>
          </div>
        }
      />

      {/* Kartu putih yang menumpang di atas pita */}
      <div className="relative z-10 -mt-10 mx-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:-mt-12 sm:mx-6">
        <div className="shrink-0 px-4 pt-4 sm:px-6">
          {/* Satu baris: nomor soal di kiri; ukuran font dan Daftar soal di kanan.
              Sisa waktu ada di tengah pita biru; di layar kecil, tempat itu tidak
              ada, jadi waktu ikut tampil di sini. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-lg font-medium text-gray-900">Soal nomor {nomor + 1}</h2>
              {sisa !== null && (
                <div className="sm:hidden">
                  <KotakWaktu sisa={sisa} gelap={false} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <span className="hidden md:inline">Ukuran font soal:</span>
                {UKURAN.map((u, i) => (
                  <button
                    key={i}
                    type="button"
                    title={u.judul}
                    aria-label={u.judul}
                    aria-pressed={ukuran === i}
                    onClick={() => setUkuran(i)}
                    className={`rounded px-1.5 leading-7 ${
                      ukuran === i ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-600" : "text-gray-600 hover:bg-gray-100"
                    }`}
                    style={{ fontSize: `${12 + i * 4}px` }}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDaftarTerbuka(true)}
                className="flex items-center gap-2 rounded-md border border-blue-600 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <IkonKotak />
                Daftar soal
                <span className="rounded bg-blue-50 px-1.5 text-xs font-semibold text-blue-700">
                  {ringkasan.dijawab}/{questions.length}
                </span>
              </button>
            </div>
          </div>
          <hr className="border-gray-200" />
        </div>

        {/* Soal: dua kolom, konteks di kiri dan pertanyaan di kanan. Tiap kolom
            bergulir sendiri, jadi konteks tetap terlihat saat pilihan digulir. */}
        <div className="min-h-0 flex-1 px-3 py-3 sm:px-6">
          <QuestionInput
            tabel
            key={soal.id}
            question={soal}
            label=""
            value={responses[soal.id]}
            onChange={(v) => onAnswer(soal.id, v, nomor)}
            kolom={{ gaya: gayaIsi, kelas: kelasGambar }}
          />
        </div>

        {/* Tombol navigasi */}
        <footer className="shrink-0 border-t border-gray-200 px-3 py-3 sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => pindah(nomor - 1)}
              disabled={nomor === 0}
              className="rounded-full bg-rose-400 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40 sm:px-6"
            >
              ‹ Soal sebelumnya
            </button>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium sm:px-6 ${
                ragu.has(soal.id) ? "bg-amber-500 text-white" : "bg-amber-400 text-gray-900"
              }`}
            >
              <input type="checkbox" checked={ragu.has(soal.id)} onChange={() => ubahRagu(soal.id)} />
              Ragu-ragu
            </label>
            {terakhir ? (
              <button
                type="button"
                onClick={() => setKonfirmasi(true)}
                className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 sm:px-6"
              >
                Selesai
              </button>
            ) : (
              <button
                type="button"
                onClick={() => pindah(nomor + 1)}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:px-6"
              >
                Soal berikutnya ›
              </button>
            )}
          </div>
        </footer>
      </div>
      <div className="h-2 shrink-0 sm:h-4" />

      {/* Daftar soal */}
      {daftarTerbuka && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setDaftarTerbuka(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg"
            role="dialog"
            aria-label="Daftar soal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Daftar soal</h3>
              <button
                type="button"
                onClick={() => setDaftarTerbuka(false)}
                aria-label="Tutup"
                title="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-green-200 bg-green-50 py-2">
                <p className="text-lg font-semibold text-green-700">{ringkasan.dijawab}</p>
                <p className="text-xs text-green-800">Sudah dijawab</p>
              </div>
              <div className="rounded border border-yellow-200 bg-yellow-50 py-2">
                <p className="text-lg font-semibold text-yellow-700">{ringkasan.ragu}</p>
                <p className="text-xs text-yellow-800">Ragu-ragu</p>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 py-2">
                <p className="text-lg font-semibold text-gray-700">{ringkasan.kosong}</p>
                <p className="text-xs text-gray-600">Belum dijawab</p>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {questions.map((q, i) => {
                const sudah = terjawab(responses[q.id]);
                const warna = ragu.has(q.id)
                  ? "border-yellow-500 bg-yellow-300 text-yellow-950"
                  : sudah
                    ? "border-green-700 bg-green-600 text-white"
                    : "border-gray-300 bg-white text-gray-700";
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => pindah(i)}
                    aria-label={`Soal ${i + 1}${ragu.has(q.id) ? ", ragu-ragu" : sudah ? ", sudah dijawab" : ", belum dijawab"}`}
                    className={`rounded border py-2 text-sm font-medium ${warna} ${
                      i === nomor ? "ring-2 ring-blue-700 ring-offset-1" : ""
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-green-700 bg-green-600" /> Sudah dijawab</li>
              <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-yellow-500 bg-yellow-300" /> Ragu-ragu</li>
              <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-gray-300 bg-white" /> Belum dijawab</li>
            </ul>
            <button
              type="button"
              onClick={() => {
                setDaftarTerbuka(false);
                setKonfirmasi(true);
              }}
              className="mt-4 w-full rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Selesai dan kirim jawaban
            </button>
          </div>
        </div>
      )}

      {/* Konfirmasi selesai */}
      {konfirmasi && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="alertdialog"
            aria-labelledby="judul-kirim"
          >
            <div className="flex flex-col items-center bg-gradient-to-b from-blue-50 to-white px-6 pb-3 pt-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                  <path d="M3.4 11.2 20.6 3.6c.8-.4 1.6.4 1.2 1.2l-7.6 17.2c-.4.9-1.7.8-2-.2l-1.9-6.2-6.2-1.9c-1-.3-1.1-1.6-.2-2Z" />
                </svg>
              </span>
              <h3 id="judul-kirim" className="mt-3 text-lg font-semibold text-gray-900">
                Kirim jawaban sekarang?
              </h3>
              <p className="mt-1 text-sm text-gray-500">Periksa kembali sebelum mengirim. Setelah dikirim, jawaban tidak bisa diubah.</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-green-200 bg-green-50 py-2.5">
                  <p className="text-xl font-semibold text-green-700">{ringkasan.dijawab}</p>
                  <p className="text-xs text-green-800">Sudah dijawab</p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 py-2.5">
                  <p className="text-xl font-semibold text-yellow-700">{ringkasan.ragu}</p>
                  <p className="text-xs text-yellow-800">Ragu-ragu</p>
                </div>
                <div className={`rounded-lg border py-2.5 ${ringkasan.kosong > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
                  <p className={`text-xl font-semibold ${ringkasan.kosong > 0 ? "text-red-700" : "text-gray-700"}`}>{ringkasan.kosong}</p>
                  <p className={`text-xs ${ringkasan.kosong > 0 ? "text-red-800" : "text-gray-600"}`}>Belum dijawab</p>
                </div>
              </div>

              {ringkasan.kosong > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">Masih ada soal yang belum dijawab. Tekan nomornya untuk kembali ke soal itu.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {questions.map((q, i) =>
                      terjawab(responses[q.id]) ? null : (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setKonfirmasi(false);
                            pindah(i);
                          }}
                          aria-label={`Ke soal ${i + 1}, belum dijawab`}
                          className="h-8 min-w-8 rounded border border-red-300 bg-white px-2 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                          {i + 1}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}

              {ringkasan.ragu > 0 && (
                <div className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-900">Soal yang kamu tandai ragu-ragu:</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {questions.map((q, i) =>
                      ragu.has(q.id) ? (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setKonfirmasi(false);
                            pindah(i);
                          }}
                          aria-label={`Ke soal ${i + 1}, ragu-ragu`}
                          className="h-8 min-w-8 rounded border border-yellow-500 bg-yellow-300 px-2 text-sm font-medium text-yellow-950 hover:bg-yellow-400"
                        >
                          {i + 1}
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setKonfirmasi(false)}
                disabled={submitting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Kembali mengerjakan
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  sudahKirim.current = true;
                  onSubmit();
                }}
                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? "Mengirim…" : "Ya, kirim jawaban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
