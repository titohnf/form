"use client";

import { useEffect, useState } from "react";
import { MathText } from "./latex";
import { bersihkanPenanda, parseIsiSoal, rataBlok } from "./isi-soal-teks";


/**
 * Gambar di dalam soal. Lebarnya dibatasi separuh, lalu bisa diklik untuk
 * dibuka sepenuh layar: selebar kolom, diagram TKA mendorong pertanyaannya
 * jauh ke bawah dan soal terbaca sebagai dua hal terpisah — sekecil ini ia jadi
 * pendamping teks, dan detail yang perlu dibaca teliti tetap terjangkau lewat
 * satu klik.
 *
 * Sengaja memakai <img> biasa, bukan next/image: berkasnya di Supabase Storage
 * dengan dimensi yang tidak diketahui saat build, dan optimasi next/image butuh
 * host itu didaftarkan lebih dulu.
 */
function Gambar({
  url,
  alt,
  onBuka,
  className,
}: {
  url: string;
  alt: string;
  onBuka: () => void;
  className?: string;
}) {
  const [rusak, setRusak] = useState(false);

  if (rusak) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
        Gambar tidak bisa dimuat
      </p>
    );
  }

  return (
    // Tombol, bukan gambar dengan onClick: yang bisa dibuka harus bisa ditemukan
    // lewat keyboard dan disebut pembaca layar sebagai sesuatu yang bisa ditekan.
    <button
      type="button"
      onClick={onBuka}
      title="Klik untuk memperbesar"
      className={`max-w-[50%] cursor-zoom-in rounded border border-gray-200 hover:border-gray-400 ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} onError={() => setRusak(true)} className="w-full rounded" />
    </button>
  );
}

function Tabel({
  baris,
  berkepala,
  className,
}: {
  baris: string[][];
  berkepala: boolean;
  className?: string;
}) {
  const kepala = berkepala ? baris[0] : null;
  const badan = berkepala ? baris.slice(1) : baris;

  return (
    // Tabel lima kolom di layar ponsel tidak bisa dibuat muat tanpa memotong
    // angkanya; digulung ke samping di dalam kotaknya sendiri, kalimat di
    // sekitarnya tetap diam.
    <div className={`max-w-full overflow-x-auto ${className ?? ""}`}>
      <table className="border-collapse text-left text-sm">
        {kepala && (
          <thead>
            <tr>
              {kepala.map((s, i) => (
                <th key={i} className="border border-gray-300 bg-gray-50 px-3 py-1.5 font-medium">
                  <MathText text={s} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {badan.map((r, i) => (
            <tr key={i}>
              {r.map((s, j) => (
                <td key={j} className="border border-gray-300 px-3 py-1.5 align-top">
                  <MathText text={s} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Isi soal, dirender utuh: paragraf, rumus, gambar, dan tabel pada urutan yang ditulis. */
export default function IsiSoal({ text, className }: { text: string; className?: string }) {
  const [dibuka, setDibuka] = useState<string | null>(null);
  const blok = parseIsiSoal(bersihkanPenanda(text));

  useEffect(() => {
    if (!dibuka) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDibuka(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dibuka]);

  const gambar = blok.filter((b) => b.jenis === "gambar");

  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ""}`}>
      {blok.map((b, i) => {
        if (b.jenis === "teks") {
          // `whitespace-pre-wrap`: enter yang diketik penyusun soal adalah
          // bagian dari soalnya — daftar keterangan, baris dialog, langkah
          // pengerjaan — dan HTML akan meleburnya jadi satu paragraf.
          return (
            <div key={i} className="whitespace-pre-wrap">
              <MathText text={b.teks} />
            </div>
          );
        }
        // Perataan blok: pembungkusnya `flex flex-col items-start`, jadi
        // rata tengah adalah `self-center`. Rumus punya jalannya sendiri —
        // KaTeX `displayMode` meratakan isinya dari dalam, dan yang bisa
        // menggesernya ke kiri cuma text-align di baris rumusnya.
        const tengah = rataBlok(b) === "tengah";

        if (b.jenis === "rumus") {
          return (
            <div key={i} className={`w-full ${tengah ? "" : "[&_.katex-display]:text-left"}`}>
              <MathText text={`$$${b.latex}$$`} />
            </div>
          );
        }
        if (b.jenis === "gambar") {
          const nomor = gambar.indexOf(b) + 1;
          return (
            <Gambar
              key={i}
              url={b.url}
              alt={gambar.length > 1 ? `Gambar soal ${nomor}` : "Gambar soal"}
              onBuka={() => setDibuka(b.url)}
              className={tengah ? "self-center" : "self-start"}
            />
          );
        }
        return (
          <Tabel
            key={i}
            baris={b.baris}
            berkepala={b.berkepala}
            className={tengah ? "self-center" : "self-start"}
          />
        );
      })}

      {dibuka && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gambar soal ukuran penuh"
          onClick={() => setDibuka(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dibuka}
            alt="Gambar soal ukuran penuh"
            // Dibatasi layar, bukan dibiarkan sebesar berkasnya: gambar 3000px
            // yang dibuka apa adanya cuma memperlihatkan sudut kirinya.
            className="max-h-full max-w-full cursor-zoom-out rounded bg-white"
          />
          <button
            type="button"
            onClick={() => setDibuka(null)}
            aria-label="Tutup gambar"
            className="absolute top-4 right-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}
