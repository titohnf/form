"use client";

import { useEffect, useState } from "react";
import { MathText } from "./latex";

/**
 * Isi sebuah soal: teks, rumus, gambar, dan tabel dalam satu string.
 *
 * Sebelumnya sebuah soal punya dua kolom yang terpisah — `prompt` untuk teks
 * dan `stimulus_images` untuk gambar — dan gambarnya selalu mendarat di atas
 * pertanyaan. Itu memaksa setiap soal berbentuk sama: gambar dulu, baru
 * kalimat. Soal TKA tidak begitu; tabelnya sering berada di tengah, gambarnya
 * sesudah kalimat pengantar dan sebelum yang ditanyakan. Maka posisi menjadi
 * bagian dari isi soal, bukan keputusan yang sudah dibuat oleh tata letak.
 *
 * Bentuknya tetap satu string biasa, bukan JSON atau HTML. Alasannya: soal
 * dicari, disalin, diimpor dari CSV, dan dikirim ke AI sebagai teks; sekali ia
 * jadi pohon, semua jalan itu harus tahu bentuk pohonnya. Yang ditambahkan
 * hanya dua penanda yang menempati satu baris sendiri:
 *
 *     [gambar: https://…/diagram.png]
 *     | Tahun | Panen |
 *     | --- | --- |
 *     | 2023 | 4,1 ton |
 *
 * Sisanya paragraf biasa, dengan `$rumus$` seperti sebelumnya.
 *
 * Berpasangan dengan `components/belajar/IsiSoal.tsx` di repo Tera. Sama
 * seperti `latex.tsx`, keduanya harus sepakat: soalnya ditulis di Sora dan
 * dibaca murid di Tera, jadi penanda yang tidak dikenali di sana bukan cuma
 * tampil jelek — ia tampil sebagai kurung siku di tengah pertanyaan.
 */

/**
 * Perataan blok yang berdiri sendiri. Hanya dua, dan itu disengaja: rata kanan
 * tidak pernah dipakai soal — angka di tabel diratakan per kolom, bukan per
 * blok — dan pilihan yang tidak pernah benar cuma menambah cara untuk salah.
 */
export type Rata = "kiri" | "tengah";

export type Blok =
  | { jenis: "teks"; teks: string }
  | { jenis: "rumus"; latex: string; rata?: Rata }
  | { jenis: "gambar"; url: string; rata?: Rata }
  | { jenis: "tabel"; baris: string[][]; berkepala: boolean; rata?: Rata };

/**
 * Perataan bawaan tiap jenis blok — yaitu apa yang sudah terjadi sebelum
 * perataan bisa dipilih. Rumus blok memang selalu di tengah (itu perilaku
 * `displayMode` KaTeX), gambar dan tabel selalu menempel kiri. Dipakai supaya
 * soal lama tidak berubah tampilannya, dan supaya penanda `[rata: …]` hanya
 * ditulis saat memang berbeda dari bawaan.
 */
export const rataBawaan = (jenis: Blok["jenis"]): Rata => (jenis === "rumus" ? "tengah" : "kiri");

/** Perataan yang berlaku untuk sebuah blok, terpilih maupun bawaan. */
export const rataBlok = (b: Blok): Rata =>
  b.jenis === "teks" ? "kiri" : (b.rata ?? rataBawaan(b.jenis));

const GAMBAR_RE = /^\s*\[gambar:\s*(\S+?)\s*\]\s*$/i;
/** Penanda perataan; berlaku untuk blok tepat di bawahnya. */
const RATA_RE = /^\s*\[rata:\s*(kiri|tengah)\s*\]\s*$/i;
/** Baris pemisah kepala tabel: `| --- | --- |`, boleh dengan titik dua. */
const PEMISAH_RE = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;

const barisTabel = (baris: string) => baris.trimStart().startsWith("|");

/** Memecah `| a | b |` menjadi selnya, membuang pipa pembuka dan penutup. */
function sel(baris: string): string[] {
  const isi = baris.trim().replace(/^\|/, "").replace(/\|$/, "");
  return isi.split("|").map((s) => s.trim());
}

export function parseIsiSoal(teks: string): Blok[] {
  const blok: Blok[] = [];
  const baris = teks.split("\n");
  let paragraf: string[] = [];

  // Penanda `[rata: …]` yang sudah dibaca dan sedang menunggu bloknya. Ditulis
  // sebelum bloknya, bukan sesudah, supaya ia terbaca saat blok itu dibentuk —
  // dan supaya penanda yatim (bloknya dihapus orang lewat suntingan teks) mati
  // begitu saja tanpa meninggalkan kurung siku di tengah soal.
  let rataMenunggu: Rata | undefined;

  const tutupParagraf = () => {
    const gabung = paragraf.join("\n").trim();
    if (gabung) blok.push({ jenis: "teks", teks: gabung });
    paragraf = [];
  };

  /** Menaruh blok berdiri sendiri, lengkap dengan perataan yang menunggunya. */
  const taruh = (b: Exclude<Blok, { jenis: "teks" }>) => {
    blok.push(rataMenunggu ? { ...b, rata: rataMenunggu } : b);
    rataMenunggu = undefined;
  };

  for (let i = 0; i < baris.length; i++) {
    const kini = baris[i];

    // Rumus yang memulai barisnya sendiri adalah blok tersendiri, bukan bagian
    // paragraf. Bedanya tidak terlihat di sini — MathText merender keduanya
    // sama — tapi editor di Sora butuh batas itu untuk memperlihatkan rumusnya
    // sebagai rumus, bukan sebagai deretan tanda dolar.
    if (kini.trimStart().startsWith("$$")) {
      tutupParagraf();
      const kumpul: string[] = [];
      let tertutup = false;
      while (i < baris.length && !tertutup) {
        kumpul.push(baris[i]);
        const jumlah = (
          kumpul.length === 1 ? baris[i].slice(baris[i].indexOf("$$") + 2) : baris[i]
        ).match(/\$\$/g)?.length;
        tertutup = (jumlah ?? 0) > 0;
        i++;
      }
      i--;
      const utuh = kumpul.join("\n").trim();
      const latex = utuh.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
      taruh({ jenis: "rumus", latex });
      continue;
    }

    const rata = kini.match(RATA_RE);
    if (rata) {
      tutupParagraf();
      rataMenunggu = rata[1].toLowerCase() as Rata;
      continue;
    }

    const gambar = kini.match(GAMBAR_RE);
    if (gambar) {
      tutupParagraf();
      taruh({ jenis: "gambar", url: gambar[1] });
      continue;
    }

    if (barisTabel(kini)) {
      tutupParagraf();
      const kumpul: string[] = [];
      while (i < baris.length && barisTabel(baris[i])) kumpul.push(baris[i++]);
      i--;

      const berkepala = kumpul.length > 1 && PEMISAH_RE.test(kumpul[1]);
      const isi = kumpul.filter((b) => !PEMISAH_RE.test(b)).map(sel);
      // Tabel satu kolom tanpa isi bukan tabel — biasanya itu pipa yang
      // nyasar di awal kalimat, dan lebih baik tampil sebagai teks apa adanya.
      if (isi.some((r) => r.some(Boolean))) taruh({ jenis: "tabel", baris: isi, berkepala });
      else paragraf.push(...kumpul);
      continue;
    }

    paragraf.push(kini);
  }
  tutupParagraf();

  return blok;
}

/** Satu baris tabel, dirakit balik jadi `| a | b |`. */
const barisPipa = (sel: string[]) => `| ${sel.join(" | ")} |`;

/**
 * Kebalikan `parseIsiSoal`. Dipakai editor blok di Sora, yang menyunting soal
 * sebagai daftar blok lalu menuliskannya balik jadi satu string — bentuk yang
 * tetap jadi satu-satunya yang disimpan.
 *
 * Blok teks yang kosong dibuang: di editor ia paragraf yang menunggu diketik,
 * di dalam soal ia baris kosong yang tidak dimaksudkan siapa pun.
 */
export function serialisasiIsiSoal(blok: Blok[]): string {
  return blok
    .map((b) => {
      if (b.jenis === "teks") return b.teks.trim() ? b.teks : "";

      let isi: string;
      if (b.jenis === "rumus") isi = `$$${b.latex}$$`;
      else if (b.jenis === "gambar") isi = `[gambar: ${b.url}]`;
      else {
        const kepala = b.berkepala
          ? [barisPipa(b.baris[0]), barisPipa(b.baris[0].map(() => "---"))]
          : [];
        const badan = (b.berkepala ? b.baris.slice(1) : b.baris).map(barisPipa);
        isi = [...kepala, ...badan].join("\n");
      }

      // Penandanya cuma ditulis kalau perataannya beda dari bawaan; soal yang
      // tidak pernah menyentuh perataan tetap tersimpan persis seperti dulu.
      return rataBlok(b) === rataBawaan(b.jenis) ? isi : `[rata: ${rataBlok(b)}]\n${isi}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Isi soal tanpa gambar dan tanpa garis tabel, untuk tempat yang hanya punya
 * satu baris: daftar soal, live monitoring, judul di halaman hasil. Di sana
 * `[gambar: …]` bukan gambar, ia cuma URL panjang yang mendorong kalimatnya
 * keluar layar.
 */
export function ringkasIsiSoal(teks: string): string {
  return parseIsiSoal(teks)
    .map((b) =>
      b.jenis === "teks"
        ? b.teks
        : b.jenis === "rumus"
          ? `$${b.latex}$`
          : b.jenis === "tabel"
            ? b.baris.map((r) => r.filter(Boolean).join(" · ")).join("; ")
            : "",
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const blok = parseIsiSoal(text);

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
