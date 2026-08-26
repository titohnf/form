"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Blok, Rata } from "@/lib/isi-soal";
import IsiSoal, { parseIsiSoal, rataBlok, serialisasiIsiSoal } from "@/lib/isi-soal";
import { MathText } from "@/lib/latex";
import { ModalGambar, ModalRumus, ModalTabel, type IsiTabel } from "./ModalIsi";

/**
 * Kolom pertanyaan sebagai tumpukan blok, bukan sebagai satu kotak teks.
 *
 * Yang disimpan tetap satu string (lihat `lib/isi-soal.tsx`) — yang berubah
 * cuma cara menyuntingnya. Sebelum ini, tabel tampil sebagai deretan pipa dan
 * gambar sebagai `[gambar: https://…]` sepanjang satu baris penuh, jadi
 * penyusun soal menulis sesuatu yang tidak mirip apa pun dengan yang akan
 * dilihat murid, lalu memeriksanya di kotak pratinjau terpisah di bawah. Di
 * sini gambar tampil sebagai gambar dan tabel sebagai tabel — dirender oleh
 * `IsiSoal`, komponen yang sama persis yang dipakai halaman murid — sehingga
 * kolom ini sendiri sudah menjadi pratinjaunya.
 *
 * Paragraf pun ikut: selama tidak sedang diketik, rumus di dalamnya tampil
 * sebagai rumus. Yang tetap berupa teks mentah hanya paragraf yang sedang
 * disunting, karena `$\\frac{1}{2}$` cuma bisa dibetulkan kalau sumbernya
 * kelihatan.
 *
 * Rumus yang berdiri sendiri, gambar, dan tabel tidak pernah disunting sebagai
 * teks — tidak ada yang mau mengetik `\\begin{matrix}` di tengah kalimat, dan
 * tidak ada yang bisa menebak lebar tabel dari deretan pipa. Ketiganya punya
 * dialognya masing-masing.
 */
export default function IsiSoalEditor({
  value,
  onChange,
  unggahGambar,
  placeholder,
  label,
  tombolSamar,
}: {
  value: string;
  onChange: (next: string) => void;
  unggahGambar: (file: File) => Promise<string>;
  placeholder?: string;
  /**
   * Nama kolomnya. Diisi, ia dirender di sini bersama tombol sisip yang duduk
   * sebaris dengannya di ujung kanan — bukan oleh pemanggil — karena tombol itu
   * milik kolom ini, dan hanya kolom ini yang tahu di mana ia muat. Kosong,
   * tombolnya masuk ke dalam kotak (dipakai pilihan jawaban, yang labelnya satu
   * untuk seluruh daftar).
   */
  label?: React.ReactNode;
  /**
   * Menyembunyikan tombol sisip sampai kolomnya disentuh. Dipakai di tempat
   * yang memuat banyak editor sekaligus — pilihan jawaban — karena empat
   * tombol yang menganggur di bawah empat pilihan lebih berisik daripada
   * berguna; yang dicari orang di sana pilihannya, bukan alat sisipnya.
   */
  tombolSamar?: boolean;
}) {
  // Bloknya disimpan, bukan dihitung ulang dari `value` tiap render: paragraf
  // kosong yang menunggu diketik tidak punya wakil di dalam string, dan tanpa
  // state ini ia lenyap begitu orangnya menyisipkan gambar lalu hendak menulis
  // di bawahnya.
  const [blok, setBlok] = useState<Blok[]>(() => normalisasi(parseIsiSoal(value)));
  const terakhir = useRef(value);
  // Blok teks yang terakhir disentuh, plus posisi kursornya — ke situlah
  // sisipan berikutnya mendarat.
  const aktif = useRef<{ i: number; pos: number }>({ i: 0, pos: 0 });
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Perubahan yang datang dari luar — draf AI yang ditambahkan, tombol Batal
  // yang menulis balik versi lama.
  useEffect(() => {
    if (value === terakhir.current) return;
    terakhir.current = value;
    setBlok(normalisasi(parseIsiSoal(value)));
  }, [value]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function tulis(next: Blok[]) {
    const rapi = normalisasi(next);
    setBlok(rapi);
    const teks = serialisasiIsiSoal(rapi);
    terakhir.current = teks;
    onChange(teks);
  }

  /**
   * Menaruh blok baru di posisi kursor. Kalau kursornya di tengah paragraf,
   * paragraf itu dibelah — gambar yang diminta muncul di antara dua kalimat
   * memang harus memisahkan keduanya.
   */
  function sisip(baru: Blok) {
    const { i, pos } = aktif.current;
    const sasaran = blok[i];
    if (sasaran?.jenis === "teks") {
      const sebelum = sasaran.teks.slice(0, pos);
      const sesudah = sasaran.teks.slice(pos);
      tulis([
        ...blok.slice(0, i),
        { jenis: "teks", teks: sebelum },
        baru,
        { jenis: "teks", teks: sesudah },
        ...blok.slice(i + 1),
      ]);
    } else {
      const at = sasaran ? i + 1 : blok.length;
      tulis([...blok.slice(0, at), baru, ...blok.slice(at)]);
    }
    setDialog(null);
  }

  /** Menyisipkan teks di posisi kursor, untuk rumus yang hidup di dalam kalimat. */
  function sisipTeks(potongan: string) {
    const { i, pos } = aktif.current;
    const sasaran = blok[i];
    if (sasaran?.jenis !== "teks") {
      sisip({ jenis: "teks", teks: potongan });
      return;
    }
    const teks = sasaran.teks.slice(0, pos) + potongan + sasaran.teks.slice(pos);
    tulis(blok.map((b, j) => (j === i ? { jenis: "teks", teks } : b)));
    aktif.current = { i, pos: pos + potongan.length };
    setDialog(null);
  }

  function ganti(i: number, baru: Blok) {
    tulis(blok.map((b, j) => (j === i ? baru : b)));
    setDialog(null);
  }

  function hapus(i: number) {
    tulis(blok.filter((_, j) => j !== i));
  }

  /** Menukar blok dengan tetangganya; itulah "pindahkan ke atas/bawah". */
  function pindah(i: number, arah: -1 | 1) {
    const j = i + arah;
    if (j < 0 || j >= blok.length) return;
    const next = [...blok];
    [next[i], next[j]] = [next[j], next[i]];
    tulis(next);
  }

  const kosong = blok.every((b) => b.jenis === "teks" && !b.teks.trim());

  const tombolSisip = (
    // Satu tombol, bukan sederet: jenis isi yang bisa masuk ke sebuah soal akan
    // terus bertambah, dan yang bertambah di balik titik tiga cuma panjang
    // daftar — tidak ada yang bergeser di layar.
    <div
      ref={menuRef}
      className={`relative shrink-0 ${
        tombolSamar && !menu
          ? "invisible group-focus-within/isi:visible group-hover/isi:visible"
          : ""
      }`}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        title="Sisipkan rumus, tabel, atau gambar"
        onClick={() => setMenu((t) => !t)}
        className={`rounded border px-2 py-0.5 text-xs ${
          menu
            ? "border-gray-400 bg-gray-50 text-gray-700"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        ⋯ Sisipkan
      </button>

      {menu && (
        // Dijatuhkan dari tepi kanan tombolnya: tombolnya sendiri sudah di
        // ujung kanan kolom, dan menu yang dibuka ke kanan akan menggantung
        // keluar dari kartu soal.
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 flex w-56 flex-col rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        >
          <BarisMenu
            nama="Rumus"
            contoh="sebaris atau di baris sendiri"
            onClick={() => {
              setMenu(false);
              setDialog({ jenis: "rumus" });
            }}
          />
          <BarisMenu
            nama="Tabel"
            contoh="kisi baris & kolom"
            onClick={() => {
              setMenu(false);
              setDialog({ jenis: "tabel" });
            }}
          />
          <BarisMenu
            nama="Gambar"
            contoh="unggah atau tempel URL"
            onClick={() => {
              setMenu(false);
              setDialog({ jenis: "gambar" });
            }}
          />
        </div>
      )}
    </div>
  );

  const isi = blok.map((b, i) =>
    b.jenis === "teks" ? (
      <Paragraf
        key={i}
        teks={b.teks}
        placeholder={i === 0 && kosong ? placeholder : undefined}
        onKursor={(pos) => (aktif.current = { i, pos })}
        onChange={(teks) => {
          aktif.current = { i, pos: aktif.current.pos };
          tulis(blok.map((lain, j) => (j === i ? { jenis: "teks", teks } : lain)));
        }}
      />
    ) : (
      <BlokKaya
        key={i}
        blok={b}
        onSunting={() => setDialog(dialogUntuk(b, i))}
        onHapus={() => hapus(i)}
        onRata={(rata) => ganti(i, { ...b, rata })}
        onNaik={i > 0 ? () => pindah(i, -1) : undefined}
        onTurun={i < blok.length - 1 ? () => pindah(i, 1) : undefined}
      />
    ),
  );

  return (
    <div className="group/isi flex flex-col gap-1">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span>{label}</span>
          {tombolSisip}
        </div>
      )}

      {/* Satu kotak untuk seluruh isi soal, dengan blok-bloknya di dalam:
          batas kotaknya adalah batas soal, sama seperti yang dilihat murid. */}
      <div className="flex items-start gap-2 rounded border border-gray-300 px-3 py-2 focus-within:border-gray-400">
        <div className="flex min-w-0 flex-1 flex-col gap-2">{isi}</div>
        {!label && tombolSisip}
      </div>

      {dialog?.jenis === "rumus" && (
        <ModalRumus
          awal={dialog.awal}
          awalBlok={dialog.awalBlok}
          onTutup={() => setDialog(null)}
          onSimpan={(latex, blok) => {
            // Rumus sebalok yang diturunkan jadi sebaris berhenti jadi blok
            // tersendiri: ia menjadi paragraf berisi satu rumus, yang bisa
            // langsung disambung kalimat di depan atau di belakangnya.
            const baru: Blok = blok
              ? { jenis: "rumus", latex }
              : { jenis: "teks", teks: `$${latex}$` };
            if (dialog.i !== undefined) ganti(dialog.i, baru);
            else if (blok) sisip(baru);
            else sisipTeks(`$${latex}$`);
          }}
        />
      )}

      {dialog?.jenis === "tabel" && (
        <ModalTabel
          awal={dialog.awal}
          onTutup={() => setDialog(null)}
          onSimpan={(tabel) => {
            const baru: Blok = { jenis: "tabel", ...tabel };
            if (dialog.i !== undefined) ganti(dialog.i, baru);
            else sisip(baru);
          }}
        />
      )}

      {dialog?.jenis === "gambar" && (
        <ModalGambar
          awal={dialog.awal}
          unggah={unggahGambar}
          onTutup={() => setDialog(null)}
          onSimpan={(url) => {
            if (dialog.i !== undefined) ganti(dialog.i, { jenis: "gambar", url });
            else sisip({ jenis: "gambar", url });
          }}
        />
      )}
    </div>
  );
}

type Dialog =
  | { jenis: "rumus"; awalBlok?: boolean; awal?: string; i?: number }
  | { jenis: "tabel"; awal?: IsiTabel; i?: number }
  | { jenis: "gambar"; awal?: string; i?: number };

function dialogUntuk(b: Blok, i: number): Dialog | null {
  if (b.jenis === "rumus") return { jenis: "rumus", awalBlok: true, awal: b.latex, i };
  if (b.jenis === "tabel")
    return { jenis: "tabel", awal: { baris: b.baris, berkepala: b.berkepala }, i };
  if (b.jenis === "gambar") return { jenis: "gambar", awal: b.url, i };
  return null;
}

/**
 * Isi soal selalu dimulai dan diakhiri paragraf, meski kosong. Tanpa itu,
 * gambar yang disisipkan paling atas atau paling bawah mengunci: tidak ada
 * tempat untuk mengetik di atas atau di bawahnya, dan satu-satunya jalan
 * keluar adalah menghapus gambarnya lagi.
 */
function normalisasi(blok: Blok[]): Blok[] {
  const hasil = [...blok];
  if (hasil.length === 0 || hasil[0].jenis !== "teks") hasil.unshift({ jenis: "teks", teks: "" });
  if (hasil[hasil.length - 1].jenis !== "teks") hasil.push({ jenis: "teks", teks: "" });
  return hasil;
}

/**
 * Satu paragraf: kotak teks tanpa bingkai, setinggi isinya.
 *
 * Paragraf yang memuat rumus punya dua wajah. Selama tidak sedang disunting ia
 * tampil sudah jadi — pecahan sebagai pecahan, akar sebagai akar — supaya
 * kolom ini benar-benar memperlihatkan soal seperti yang akan dikerjakan
 * murid. Diklik, ia kembali jadi teks yang bisa diketik, karena `$\frac{1}{2}$`
 * hanya bisa dibetulkan kalau sumbernya kelihatan.
 *
 * Paragraf tanpa rumus tidak ikut berganti wajah: tidak ada bedanya antara
 * teks biasa yang dirender dan teks biasa di dalam textarea, dan menukarnya
 * hanya akan memindahkan kursor orang yang sedang mengetik.
 */
function Paragraf({
  teks,
  placeholder,
  onChange,
  onKursor,
}: {
  teks: string;
  placeholder?: string;
  onChange: (teks: string) => void;
  onKursor: (pos: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menyunting, setMenyunting] = useState(false);
  const adaRumus = teks.includes("$");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [teks, menyunting]);

  // Kursor ditaruh di ujung teks saat wajahnya berganti: mengira-ngira huruf
  // ke berapa yang diklik di atas teks yang sudah dirender akan salah persis
  // di paragraf yang paling butuh benar — yang penuh rumus.
  useLayoutEffect(() => {
    if (!menyunting) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [menyunting]);

  if (adaRumus && !menyunting) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        title="Klik untuk menyunting"
        onClick={() => setMenyunting(true)}
        onFocus={() => setMenyunting(true)}
        className="w-full cursor-text rounded whitespace-pre-wrap hover:bg-gray-50/60"
      >
        <MathText text={teks} />
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={teks}
      placeholder={placeholder}
      onChange={(e) => {
        onKursor(e.target.selectionStart ?? e.target.value.length);
        onChange(e.target.value);
      }}
      onFocus={(e) => {
        setMenyunting(true);
        onKursor(e.target.selectionStart ?? 0);
      }}
      onBlur={() => setMenyunting(false)}
      onSelect={(e) => onKursor(e.currentTarget.selectionStart ?? 0)}
      className="w-full resize-none overflow-hidden bg-transparent text-base outline-none"
    />
  );
}

/**
 * Rumus blok, gambar, atau tabel — ditampilkan persis seperti nanti di layar
 * murid, dengan tombolnya muncul saat kursor lewat. Tombol yang selalu terlihat
 * akan menempel di tiap gambar dan tiap tabel sepanjang soal, dan yang sedang
 * dinilai orangnya adalah isinya, bukan tombolnya.
 */
function BlokKaya({
  blok,
  onSunting,
  onHapus,
  onRata,
  onNaik,
  onTurun,
}: {
  blok: Blok;
  onSunting: () => void;
  onHapus: () => void;
  onRata: (rata: Rata) => void;
  onNaik?: () => void;
  onTurun?: () => void;
}) {
  const rata = rataBlok(blok);

  return (
    <div className="group relative rounded border border-transparent px-1 py-0.5 hover:border-gray-200 hover:bg-gray-50/60">
      {/* `pointer-events-none` di gambar: klik di sana membuka lightbox, dan di
          dalam editor yang lebih dibutuhkan adalah tombol Ganti di atasnya. */}
      <div className={blok.jenis === "gambar" ? "[&_button]:pointer-events-none" : undefined}>
        <IsiSoal text={serialisasiIsiSoal([blok])} />
      </div>

      <div className="absolute top-1 right-1 hidden items-center gap-1 rounded border border-gray-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex">
        {onNaik && <TombolKecil label="↑" title="Pindahkan ke atas" onClick={onNaik} />}
        {onTurun && <TombolKecil label="↓" title="Pindahkan ke bawah" onClick={onTurun} />}
        <TombolKecil
          label="Kiri"
          title="Ratakan ke kiri"
          aktif={rata === "kiri"}
          onClick={() => onRata("kiri")}
        />
        <TombolKecil
          label="Tengah"
          title="Ratakan ke tengah"
          aktif={rata === "tengah"}
          onClick={() => onRata("tengah")}
        />
        <TombolKecil
          label={blok.jenis === "gambar" ? "Ganti" : "Sunting"}
          title="Buka dialognya"
          onClick={onSunting}
        />
        <TombolKecil label="Hapus" title="Hapus blok ini" onClick={onHapus} merah />
      </div>
    </div>
  );
}

function TombolKecil({
  label,
  title,
  onClick,
  merah,
  aktif,
}: {
  label: string;
  title: string;
  onClick: () => void;
  merah?: boolean;
  /** Untuk tombol yang menyatakan keadaan, seperti perataan yang sedang berlaku. */
  aktif?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={aktif}
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-xs hover:bg-gray-100 ${
        aktif
          ? "bg-gray-100 font-medium text-gray-900"
          : merah
            ? "text-gray-500 hover:text-red-600"
            : "text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

/** Satu baris di menu sisip: nama jenis isinya, plus penjelasan sebaris. */
function BarisMenu({
  nama,
  contoh,
  onClick,
}: {
  nama: string;
  contoh: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-gray-50"
    >
      <span className="text-xs font-medium text-gray-700">{nama}</span>
      <span className="text-[11px] text-gray-400">{contoh}</span>
    </button>
  );
}
