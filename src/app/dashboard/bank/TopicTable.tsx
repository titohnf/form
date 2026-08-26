"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, SearchInput } from "@/lib/SearchFilter";

export interface TopicRow {
  groupId: string;
  subjectId: string;
  subjectName: string;
  grade: string;
  theme: string | null;
  topic: string;
  total: number;
  /** Berapa dari `total` yang sudah punya pembahasan. Selalu ≤ `total`. */
  withExplanation: number;
}

const PER_PAGE = 25;

type Isi = "" | "ada" | "kosong";

type Kolom = "subjectName" | "grade" | "theme" | "topic" | "total";
type Arah = "naik" | "turun";

const KOLOM: { key: Kolom; label: string; align?: "right" }[] = [
  { key: "subjectName", label: "Mapel" },
  { key: "grade", label: "Kelas" },
  { key: "theme", label: "Tema" },
  { key: "topic", label: "Topik" },
  { key: "total", label: "Soal / Pembahasan", align: "right" },
];

/**
 * Membandingkan dua baris pada satu kolom.
 *
 * Kelas dibandingkan `numeric` karena "Kelas 12" berada sebelum "Kelas 2" kalau
 * diadu sebagai teks biasa. Tema kosong selalu turun ke bawah, ke arah mana pun
 * urutannya: deretan "—" di puncak tabel bukan jawaban atas permintaan
 * mengurutkan tema.
 */
function bandingkan(a: TopicRow, b: TopicRow, kolom: Kolom): number {
  // Dua topik dengan jumlah soal sama diurutkan lagi menurut pembahasannya:
  // yang paling tertinggal berkumpul di satu ujung, bukan berserak.
  if (kolom === "total") return a.total - b.total || a.withExplanation - b.withExplanation;
  if (kolom === "grade") return a.grade.localeCompare(b.grade, "id", { numeric: true });
  if (kolom === "theme") {
    if (!a.theme || !b.theme) return (a.theme ? 0 : 1) - (b.theme ? 0 : 1);
    return a.theme.localeCompare(b.theme, "id");
  }
  return a[kolom].localeCompare(b[kolom], "id");
}

const ISI_LABEL: Record<Isi, string> = {
  "": "Semua topik",
  ada: "Sudah ada soal",
  kosong: "Masih kosong",
};

/**
 * Daftar topik sebagai tabel, satu baris satu topik.
 *
 * Baris di sini adalah TOPIK, bukan soal — itulah yang membuat halaman ini
 * ringan dan membuat topik kosong akhirnya kelihatan. Sebelumnya topik tanpa
 * soal tidak dirender sama sekali, padahal justru topik itulah yang perlu
 * diisi; satu-satunya cara menemukannya adalah menebak lewat penyaring.
 *
 * Disaring dan dipaginasi di klien: taksonomi Tera berkisar ratusan baris, jadi
 * seluruhnya sudah ada di tangan, dan bolak-balik ke server hanya akan membuat
 * penyaringan terasa berat tanpa menghemat apa pun.
 */
export default function TopicTable({ rows }: { rows: TopicRow[] }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [isi, setIsi] = useState<Isi>("");
  const [urut, setUrut] = useState<{ kolom: Kolom; arah: Arah } | null>(null);
  const [page, setPage] = useState(0);

  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.subjectId, r.subjectName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], "id"));
  }, [rows]);

  const grades = useMemo(
    () =>
      [...new Set(rows.map((r) => r.grade))].sort((a, b) =>
        a.localeCompare(b, "id", { numeric: true }),
      ),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (subject && r.subjectId !== subject) return false;
      if (grade && r.grade !== grade) return false;
      if (isi === "ada" && r.total === 0) return false;
      if (isi === "kosong" && r.total > 0) return false;
      if (!needle) return true;
      return (r.theme ?? "").toLowerCase().includes(needle);
    });
  }, [rows, query, subject, grade, isi]);

  // Tanpa kolom yang dipilih, urutannya dibiarkan seperti datang dari server —
  // urutan kurikulum Tera, yang sudah masuk akal sebagai bawaan.
  const sorted = useMemo(() => {
    if (!urut) return visible;
    const arah = urut.arah === "naik" ? 1 : -1;
    // Perbandingan cadangan pada topik: dua baris dengan mapel yang sama tidak
    // boleh berpindah-pindah tempat tiap kali tabel dirender ulang.
    return [...visible].sort(
      (a, b) => arah * bandingkan(a, b, urut.kolom) || a.topic.localeCompare(b.topic, "id"),
    );
  }, [visible, urut]);

  // Halaman ke-9 dari hasil yang tinggal dua baris adalah layar kosong tanpa
  // sebab; menyaring selalu memulangkan orang ke halaman pertama.
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const shown = sorted.slice(current * PER_PAGE, (current + 1) * PER_PAGE);

  // Klik pertama pada sebuah kolom mengurutkan naik, klik kedua membalikkannya,
  // klik ketiga melepas urutan itu dan memulangkan tabel ke urutan kurikulum.
  function urutkan(kolom: Kolom) {
    setPage(0);
    setUrut((kini) => {
      if (kini?.kolom !== kolom) return { kolom, arah: "naik" };
      return kini.arah === "naik" ? { kolom, arah: "turun" } : null;
    });
  }

  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(0);
    };
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchInput
          value={query}
          onChange={reset(setQuery)}
          placeholder="Cari tema…"
          label="Cari tema"
        />
        <FilterSelect value={subject} onChange={reset(setSubject)} label="Saring mapel">
          <option value="">Semua mapel</option>
          {subjects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={grade} onChange={reset(setGrade)} label="Saring kelas">
          <option value="">Semua kelas</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={isi} onChange={reset(setIsi)} label="Saring isi">
          {(Object.keys(ISI_LABEL) as Isi[]).map((k) => (
            <option key={k} value={k}>
              {ISI_LABEL[k]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Tidak ada topik yang cocok dengan saringan itu.
        </p>
      ) : (
        /* Tabel lebar tidak boleh membuat seluruh halaman ikut menggeser. */
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                {KOLOM.map((k) => {
                  const aktif = urut?.kolom === k.key;
                  return (
                    <th
                      key={k.key}
                      className="font-medium"
                      aria-sort={
                        aktif ? (urut.arah === "naik" ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => urutkan(k.key)}
                        className={`flex w-full items-center gap-1 px-4 py-3 tracking-wide uppercase transition-colors hover:text-gray-900 ${
                          k.align === "right" ? "justify-end" : ""
                        } ${aktif ? "text-gray-900" : ""}`}
                      >
                        {k.label}
                        <span aria-hidden className={aktif ? "" : "text-gray-300"}>
                          {aktif && urut.arah === "turun" ? "↓" : "↑"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.groupId} className="transition-colors hover:bg-slate-50">
                  {/* Tautannya di tiap sel, bukan handler klik di <tr>: baris
                      yang bisa diklik tapi bukan tautan tidak bisa dibuka di tab
                      baru, tidak bisa difokus dengan keyboard, dan tidak
                      terbaca pembaca layar sebagai sesuatu yang menuju ke mana
                      pun. */}
                  <Cell href={`/dashboard/bank/${r.groupId}`}>{r.subjectName}</Cell>
                  <Cell href={`/dashboard/bank/${r.groupId}`}>{gradeNumber(r.grade)}</Cell>
                  <Cell href={`/dashboard/bank/${r.groupId}`} muted>
                    {r.theme || "—"}
                  </Cell>
                  <Cell href={`/dashboard/bank/${r.groupId}`} focusable>
                    <span className="font-medium text-gray-900">{r.topic}</span>
                  </Cell>
                  <Cell href={`/dashboard/bank/${r.groupId}`} align="right">
                    <Jumlah total={r.total} pembahasan={r.withExplanation} />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <span>
            {current * PER_PAGE + 1}–{Math.min((current + 1) * PER_PAGE, sorted.length)} dari{" "}
            {sorted.length} topik
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                Sebelumnya
              </button>
              <span>
                {current + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Jumlah soal dan berapa di antaranya yang sudah punya pembahasan, "10/1".
 *
 * Soal tanpa pembahasan tetap bisa dikerjakan, tapi diam saat murid salah — di
 * Latihan Soal itulah satu-satunya saat murid belajar sesuatu. Jadi angka yang
 * penting bukan cuma "topik ini sudah ada isinya", melainkan berapa di antaranya
 * yang benar-benar siap dipakai; sisi kanan diberi warna hanya ketika masih ada
 * yang tertinggal, supaya topik yang sudah rampung tidak ikut berteriak.
 */
function Jumlah({ total, pembahasan }: { total: number; pembahasan: number }) {
  if (total === 0) return <span className="text-gray-400">kosong</span>;
  const lengkap = pembahasan === total;
  return (
    <span title={`${total} soal, ${pembahasan} sudah ada pembahasan`}>
      <span className="font-medium text-gray-900">{total}</span>
      <span className="mx-0.5 text-gray-400">/</span>
      <span className={lengkap ? "font-medium text-gray-900" : "font-medium text-amber-600"}>
        {pembahasan}
      </span>
    </span>
  );
}

/**
 * "Kelas 7" di kolom berjudul Kelas mengulang judulnya di tiap baris; yang
 * membedakan satu baris dari yang lain hanya angkanya. Bentuk lain dibiarkan
 * utuh — kalau Tera suatu saat menulis kelas tanpa pola itu, lebih baik tampil
 * apa adanya daripada hilang.
 */
function gradeNumber(grade: string): string {
  return grade.replace(/^Kelas\s+/i, "");
}

/**
 * Satu sel yang seluruh luasnya jadi tautan, supaya barisnya benar-benar bisa
 * diklik di mana pun.
 *
 * Hanya sel Topik yang bisa difokus keyboard (`focusable`); sisanya dilewati.
 * Lima tautan ke tempat yang sama per baris berarti pengguna keyboard menekan
 * Tab lima kali untuk melewati satu topik — barisnya cukup punya satu
 * perhentian, dan itu sel yang menamainya.
 */
function Cell({
  href,
  children,
  align,
  muted,
  focusable,
}: {
  href: string;
  children: React.ReactNode;
  align?: "right";
  muted?: boolean;
  focusable?: boolean;
}) {
  return (
    <td className={muted ? "text-gray-500" : "text-gray-700"}>
      <Link
        href={href}
        className={`block px-4 py-3 ${align === "right" ? "text-right" : ""}`}
        tabIndex={focusable ? undefined : -1}
        aria-hidden={focusable ? undefined : true}
      >
        {children}
      </Link>
    </td>
  );
}
