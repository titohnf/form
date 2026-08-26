"use client";

import { useEffect, useRef, useState } from "react";
import { MathText } from "@/lib/latex";

/**
 * Tiga dialog untuk tiga jenis isi soal: rumus, tabel, gambar.
 *
 * Masing-masing punya bentuknya sendiri karena yang ditanyakan memang berbeda —
 * rumus butuh papan simbol dan pratinjau, tabel butuh kisi yang bisa ditambah
 * kolomnya, gambar butuh unggahan. Sebelum ini ketiganya menyisipkan penanda
 * teks mentah ke dalam kolom pertanyaan, dan penyusun soal baru tahu hasilnya
 * setelah menebak sintaks yang benar.
 *
 * Semuanya menyunting satu blok, lalu mengembalikan nilainya ke editor isi soal
 * yang memanggil. Tidak ada yang menyentuh database dari sini kecuali unggahan
 * gambar, yang memang harus punya URL sebelum bisa ditampilkan.
 */

/** Kerangka dialog: latar gelap, satu panel, dua tombol. */
function Modal({
  judul,
  keterangan,
  onTutup,
  onSimpan,
  bisaSimpan = true,
  labelSimpan = "Sisipkan",
  children,
}: {
  judul: string;
  keterangan?: string;
  onTutup: () => void;
  onSimpan: () => void;
  bisaSimpan?: boolean;
  labelSimpan?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onTutup]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={judul}
      onClick={onTutup}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div
        // Klik di dalam panel tidak boleh ikut menutupnya — orang menyeret
        // kursor saat memilih teks, dan lepasnya kerap mendarat di luar.
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <div>
          <h2 className="text-sm font-medium text-gray-900">{judul}</h2>
          {keterangan && <p className="mt-0.5 text-xs text-gray-500">{keterangan}</p>}
        </div>

        {children}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onSimpan}
            disabled={!bisaSimpan}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {labelSimpan}
          </button>
          <button
            type="button"
            onClick={onTutup}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Papan simbol di dalam dialog rumus. LaTeX-nya telanjang di sini — tanpa tanda
 * dolar — karena dialognya yang tahu rumus ini akan jadi sebaris atau sebalok.
 */
const SIMBOL: { label: string; title: string; sisip: string }[] = [
  { label: "a⁄b", title: "Pecahan", sisip: "\\frac{#}{ }" },
  { label: "x²", title: "Pangkat", sisip: "x^{#}" },
  { label: "x₁", title: "Indeks bawah", sisip: "x_{#}" },
  { label: "√", title: "Akar", sisip: "\\sqrt{#}" },
  { label: "×", title: "Kali", sisip: "\\times #" },
  { label: "÷", title: "Bagi", sisip: "\\div #" },
  { label: "±", title: "Plus minus", sisip: "\\pm #" },
  { label: "≤", title: "Kurang dari sama dengan", sisip: "\\leq #" },
  { label: "≥", title: "Lebih dari sama dengan", sisip: "\\geq #" },
  { label: "≠", title: "Tidak sama dengan", sisip: "\\neq #" },
  { label: "π", title: "Pi", sisip: "\\pi #" },
  { label: "°", title: "Derajat", sisip: "^\\circ #" },
  { label: "Σ", title: "Sigma (jumlah)", sisip: "\\sum_{i=1}^{n} #" },
];

export function ModalRumus({
  awal,
  awalBlok = false,
  onSimpan,
  onTutup,
}: {
  awal?: string;
  /** true = rumus berdiri di barisnya sendiri, false = di tengah kalimat. */
  awalBlok?: boolean;
  onSimpan: (latex: string, blok: boolean) => void;
  onTutup: () => void;
}) {
  const [latex, setLatex] = useState(awal ?? "");
  // Sebaris atau sebalok bukan dua jenis isi yang berbeda — itu cuma cara
  // rumus yang sama menempati ruang. Jadi keduanya satu dialog, dan yang
  // memilih adalah sakelar di bawah pratinjau, tempat bedanya kelihatan.
  const [blok, setBlok] = useState(awalBlok);
  const ref = useRef<HTMLTextAreaElement>(null);

  function sisip(potongan: string) {
    const el = ref.current;
    const slot = potongan.indexOf("#");
    const teks = potongan.replace("#", "");
    const start = el?.selectionStart ?? latex.length;
    const end = el?.selectionEnd ?? start;
    const next = latex.slice(0, start) + teks + latex.slice(end);
    const caret = start + (slot === -1 ? teks.length : slot);

    if (el) {
      el.value = next;
      el.focus();
      el.setSelectionRange(caret, caret);
    }
    setLatex(next);
  }

  return (
    <Modal
      judul="Rumus"
      keterangan="Ditulis dengan LaTeX. Papan simbol di bawah menyisipkan di posisi kursor."
      onTutup={onTutup}
      onSimpan={() => onSimpan(latex.trim(), blok)}
      bisaSimpan={Boolean(latex.trim())}
      labelSimpan={awal === undefined ? "Sisipkan" : "Simpan"}
    >
      <textarea
        ref={ref}
        autoFocus
        rows={3}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        placeholder="\frac{1}{2}"
        className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
      />

      <div className="flex flex-wrap items-center gap-1">
        {SIMBOL.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => sisip(s.sisip)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Pratinjau memakai renderer yang sama dengan halaman murid, jadi rumus
          yang salah ketik memperlihatkan dirinya merah di sini — bukan nanti.
          Kalimat pengapitnya ada supaya pilihan sebaris/sebalok terlihat
          bedanya: sebalok, rumusnya memutus kalimat dan berdiri di tengah. */}
      <div className="rounded border border-dashed border-gray-200 px-3 py-2 text-base">
        <span className="text-xs text-gray-400">Begini nanti terlihat:</span>
        <div className="mt-1 text-gray-500">
          {latex.trim() ? (
            <>
              Sebelumnya… <MathText text={blok ? `$$${latex}$$` : `$${latex}$`} /> …sesudahnya.
            </>
          ) : (
            <span className="text-sm text-gray-400">Belum ada rumus.</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        {[
          { nilai: false, label: "Di tengah kalimat" },
          { nilai: true, label: "Di baris sendiri" },
        ].map((pilihan) => (
          <label key={String(pilihan.nilai)} className="flex items-center gap-1">
            <input
              type="radio"
              checked={blok === pilihan.nilai}
              onChange={() => setBlok(pilihan.nilai)}
            />
            {pilihan.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export interface IsiTabel {
  baris: string[][];
  berkepala: boolean;
}

const TABEL_BARU: IsiTabel = {
  baris: [
    ["Kolom 1", "Kolom 2"],
    ["", ""],
  ],
  berkepala: true,
};

export function ModalTabel({
  awal,
  onSimpan,
  onTutup,
}: {
  awal?: IsiTabel;
  onSimpan: (tabel: IsiTabel) => void;
  onTutup: () => void;
}) {
  const [baris, setBaris] = useState<string[][]>(awal?.baris ?? TABEL_BARU.baris);
  const [berkepala, setBerkepala] = useState(awal?.berkepala ?? TABEL_BARU.berkepala);
  const kolom = Math.max(...baris.map((r) => r.length), 1);

  /** Semua baris dijaga sepanjang kolom terbanyak; kisi yang rompang tidak bisa disunting. */
  const rata = (rows: string[][], lebar: number) =>
    rows.map((r) => Array.from({ length: lebar }, (_, i) => r[i] ?? ""));

  function ubahSel(r: number, k: number, nilai: string) {
    setBaris((prev) =>
      rata(prev, kolom).map((row, i) => (i === r ? row.map((s, j) => (j === k ? nilai : s)) : row)),
    );
  }

  return (
    <Modal
      judul={awal ? "Sunting tabel" : "Tabel"}
      keterangan="Isi selnya seperti di spreadsheet. Sel boleh memuat rumus di antara tanda $."
      onTutup={onTutup}
      onSimpan={() =>
        onSimpan({
          // Baris dan kolom yang seluruhnya kosong dibuang: orang menambah satu
          // baris untuk berjaga-jaga, lalu tidak jadi memakainya, dan tabel
          // murid tidak boleh punya baris hampa karena itu.
          baris: rata(baris, kolom)
            .filter((r, i) => (berkepala && i === 0) || r.some((s) => s.trim()))
            .map((r) => r.map((s) => s.trim())),
          berkepala,
        })
      }
      bisaSimpan={baris.some((r) => r.some((s) => s.trim()))}
      labelSimpan={awal ? "Simpan" : "Sisipkan"}
    >
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {rata(baris, kolom).map((row, r) => (
              <tr key={r}>
                {row.map((nilai, k) => (
                  <td key={k} className="border border-gray-200 p-0">
                    <input
                      value={nilai}
                      onChange={(e) => ubahSel(r, k, e.target.value)}
                      className={`w-32 px-2 py-1 text-sm outline-none focus:bg-blue-50 ${
                        berkepala && r === 0 ? "bg-gray-50 font-medium" : ""
                      }`}
                    />
                  </td>
                ))}
                <td className="pl-1">
                  <button
                    type="button"
                    title="Hapus baris ini"
                    disabled={rata(baris, kolom).length <= 1}
                    onClick={() => setBaris((prev) => prev.filter((_, i) => i !== r))}
                    className="px-1 text-xs text-gray-400 hover:text-red-600 disabled:opacity-30"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {Array.from({ length: kolom }, (_, k) => (
                <td key={k} className="text-center">
                  <button
                    type="button"
                    title="Hapus kolom ini"
                    disabled={kolom <= 1}
                    onClick={() =>
                      setBaris((prev) => rata(prev, kolom).map((r) => r.filter((_, j) => j !== k)))
                    }
                    className="px-1 text-xs text-gray-400 hover:text-red-600 disabled:opacity-30"
                  >
                    ×
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setBaris((prev) => [...rata(prev, kolom), Array(kolom).fill("")])}
          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        >
          + Baris
        </button>
        <button
          type="button"
          onClick={() => setBaris((prev) => rata(prev, kolom + 1))}
          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        >
          + Kolom
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={berkepala}
            onChange={(e) => setBerkepala(e.target.checked)}
          />
          Baris pertama adalah kepala tabel
        </label>
      </div>
    </Modal>
  );
}

export function ModalGambar({
  awal,
  unggah,
  onSimpan,
  onTutup,
}: {
  awal?: string;
  unggah: (file: File) => Promise<string>;
  onSimpan: (url: string) => void;
  onTutup: () => void;
}) {
  const [url, setUrl] = useState(awal ?? "");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [rusak, setRusak] = useState(false);

  async function pilih(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setSibuk(true);
    setGalat(null);
    try {
      setUrl(await unggah(file));
      setRusak(false);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Modal
      judul={awal ? "Ganti gambar" : "Gambar"}
      keterangan="Unggah berkas, atau tempel URL gambar yang sudah ada."
      onTutup={onTutup}
      onSimpan={() => onSimpan(url.trim())}
      bisaSimpan={Boolean(url.trim()) && !sibuk}
      labelSimpan={awal ? "Simpan" : "Sisipkan"}
    >
      <input
        type="file"
        accept="image/*"
        disabled={sibuk}
        onChange={(e) => {
          void pilih(e.target.files);
          // Supaya memilih berkas yang sama dua kali tetap memicu onChange.
          e.target.value = "";
        }}
        className="text-xs file:mr-2 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-gray-50 disabled:opacity-50"
      />
      {sibuk && <p className="text-xs text-gray-500">Mengunggah…</p>}
      {galat && <p className="text-xs text-red-600">{galat}</p>}

      <label className="flex flex-col gap-1 text-xs text-gray-500">
        URL gambar
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setRusak(false);
          }}
          placeholder="https://…/gambar.png"
          className="rounded border border-gray-300 px-3 py-2 font-mono text-xs text-gray-700"
        />
      </label>

      <div className="rounded border border-dashed border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-400">Begini nanti terlihat:</span>
        {url.trim() ? (
          rusak ? (
            <p className="mt-1 text-sm text-red-600">Gambar tidak bisa dimuat dari URL itu.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              onError={() => setRusak(true)}
              className="mt-1 max-h-48 rounded border border-gray-200"
            />
          )
        ) : (
          <p className="mt-1 text-sm text-gray-400">Belum ada gambar.</p>
        )}
      </div>
    </Modal>
  );
}
