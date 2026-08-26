"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurriculumTopicGroup } from "@/lib/types";
import { topicLabel } from "@/lib/curriculum";
import { SearchInput } from "@/lib/SearchFilter";
import type { SubjectTopics } from "./BankItem";

/** Nama topik tanpa kelasnya, dipakai saat kelasnya sudah jadi judul di atasnya. */
function withinGrade(group: CurriculumTopicGroup): string {
  const semester = group.curriculum === "TKA" ? null : `Sem ${group.semester}`;
  const scope = [semester, group.theme].filter(Boolean).join(" · ");
  return scope ? `${scope} — ${group.topic}` : group.topic;
}

/** "Kelas 11" sebelum "Kelas 2": urutan angka, bukan urutan abjad. */
function byGradeNumber(a: string, b: string): number {
  const n = (s: string) => Number(s.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  return n(a) - n(b) || a.localeCompare(b);
}

/** Satu kalimat yang sama di mana pun topiknya tidak ketemu. */
const PETUNJUK_TERA = "Mapel, kelas, dan topik disusun di Tera → Kurikulum.";

const chip = "rounded-full border px-3 py-1.5 text-sm transition-colors";
const chipOn = "border-blue-600 bg-blue-600 text-white";
const chipOff = "border-slate-300 text-gray-700 hover:border-gray-400 hover:bg-slate-50";

/** Topik yang sedang dipilih beserta nama mapelnya, atau undefined. */
export function findTopic(subjects: SubjectTopics[], groupId: string) {
  return subjects
    .flatMap((s) => s.groups.map((group) => ({ subjectName: s.subjectName, group })))
    .find((entry) => entry.group.id === groupId);
}

/** Kotak dialog sederhana: latar gelap, Escape menutup, klik luar menutup. */
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6"
      onClick={onClose}
    >
      {/* Layar pendek: isinya yang tergulung, bukan tombolnya yang terpotong
          di luar layar tanpa cara mencapainya. */}
      <div
        className="max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * Pemilih topik: kelas, lalu mapel, baru daftar topiknya. Urutannya sama
 * dengan cara topiknya nanti ditulis di label kartu soal —
 * "Kelas 9 · Matematika · Bilangan · Bilangan Real".
 *
 * Satu select berisi seluruh topik pernah dicoba dan tidak terpakai — 175 baris
 * datar terlalu banyak untuk dibaca, apalagi 111 di antaranya Matematika.
 * Menyempitkan lewat kelas dan mapel menyisakan sekitar sepuluh topik, jumlah
 * yang bisa dipindai sekali lihat.
 *
 * Ketiga langkahnya SELALU terlihat, termasuk yang belum bisa dipakai. Dulu
 * barisnya muncul satu per satu begitu langkah sebelumnya dijawab, dan orang
 * yang baru membuka dialog ini melihat sederet chip mapel tanpa keterangan,
 * lalu tiba-tiba sederet chip lain menyusul di bawahnya — tidak ada yang
 * memberi tahu bahwa itu kelas, bahwa masih ada langkah ketiga, atau bahwa yang
 * dituju sebenarnya topik. Langkah yang belum bisa dijawab tetap berdiri
 * sebagai baris redup berisi kalimat apa yang kurang, jadi seluruh jalannya
 * terbaca sejak layar pertama.
 *
 * Kotak pencarian melompati ketiganya untuk orang yang sudah tahu nama
 * topiknya dan tidak mau mengklik dua kali dulu.
 */
export function TopicPicker({
  subjects,
  value,
  onChange,
  name,
  chosenPrefix = "Dibuat di",
}: {
  subjects: SubjectTopics[];
  value: string;
  onChange: (groupId: string) => void;
  /** Diisi kalau pemilih ini bagian dari <form>; kalau tidak, cukup `onChange`. */
  name?: string;
  chosenPrefix?: string;
}) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const query = search.trim().toLowerCase();

  const found = useMemo(() => {
    if (!query) return null;
    return subjects.flatMap((subject) =>
      subject.groups
        .filter((group) =>
          `${subject.subjectName} ${topicLabel(group)}`.toLowerCase().includes(query),
        )
        .map((group) => ({ subjectName: subject.subjectName, group })),
    );
  }, [query, subjects]);

  // Pilihan bisa tergulir keluar layar atau tersaring keluar begitu pencarian
  // diketik, sementara tombolnya tetap menyala. Menuliskannya kembali di bawah
  // membuat "yang terpilih apa" tidak pernah jadi tebakan.
  const chosen = findTopic(subjects, value);

  // Kelasnya lebih dulu, jadi daftarnya seluruh kelas yang dikenal kurikulum,
  // bukan kelas milik satu mapel.
  const grades = [...new Set(subjects.flatMap((s) => s.groups.map((g) => g.grade_level)))].sort(
    byGradeNumber,
  );
  // Tidak semua mapel diajarkan di semua kelas; yang ditawarkan hanya yang
  // benar-benar punya topik di kelas itu.
  const mapel = grade ? subjects.filter((s) => s.groups.some((g) => g.grade_level === grade)) : [];
  const subject = mapel.find((s) => s.subjectId === subjectId) ?? null;
  const topics = subject && grade ? subject.groups.filter((g) => g.grade_level === grade) : [];

  // Pencariannya nihil, atau daftar topiknya sudah terbentang dan belum ada
  // yang dipilih — dua saat orang benar-benar sedang mencari topik yang
  // mungkin memang belum ada.
  const petunjukPerlu = found ? found.length === 0 : Boolean(subject && grade && !chosen);

  function pickGrade(g: string) {
    setGrade(g);
    // Mapel yang tadi dipilih belum tentu diajarkan di kelas yang baru, dan
    // topik yang terlanjur terpilih pasti milik kelas yang lama.
    setSubjectId("");
    onChange("");
  }

  // Taksonomi masih kosong: kotak cari dan tiga langkah yang seluruhnya tidak
  // bisa dijawab cuma menyamarkan bahwa yang kurang ada di aplikasi sebelah.
  if (subjects.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">
        Belum ada topik kurikulum sama sekali. Susun dulu di Tera → Kurikulum, lalu topiknya muncul
        di sini.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {name && <input type="hidden" name={name} value={value} />}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Cari topik…"
        label="Cari topik"
        autoFocus
      />

      {found ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          {found.length === 0 ? (
            /* Kalimat Tera-nya tidak diulang di sini: baris penunjuk di kaki
               pemilih berdiri tepat di bawah kotak ini. */
            <p className="p-3 text-sm text-gray-500">Tidak ada topik yang cocok.</p>
          ) : (
            found.map(({ subjectName, group }) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onChange(group.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  value === group.id ? "bg-blue-50 font-medium text-blue-700" : "hover:bg-slate-50"
                }`}
              >
                {topicLabel(group)}
                <span className="text-gray-400"> · {subjectName}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Garis pemisah yang menamai apa yang ada di bawahnya: tanpa ini,
              deretan chip terbaca sebagai penyaring kotak cari, bukan sebagai
              jalan lain menuju hal yang sama. */}
          <Pemisah>atau pilih bertahap</Pemisah>

          <Langkah nomor={1} judul="Kelas">
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => pickGrade(g)}
                  className={`${chip} ${g === grade ? chipOn : chipOff}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Langkah>

          <Langkah nomor={2} judul="Mapel">
            {grade ? (
              <div className="flex flex-wrap gap-2">
                {mapel.map((s) => (
                  <button
                    key={s.subjectId}
                    type="button"
                    onClick={() => {
                      setSubjectId(s.subjectId);
                      onChange("");
                    }}
                    className={`${chip} ${s.subjectId === subjectId ? chipOn : chipOff}`}
                  >
                    {s.subjectName}
                  </button>
                ))}
              </div>
            ) : (
              <Menunggu>Pilih kelasnya dulu.</Menunggu>
            )}
          </Langkah>

          <Langkah nomor={3} judul="Topik">
            {subject && grade ? (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {topics.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onChange(group.id)}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      value === group.id
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {withinGrade(group)}
                  </button>
                ))}
              </div>
            ) : (
              <Menunggu>
                {grade ? "Pilih mapelnya dulu." : "Pilih kelas dan mapelnya dulu."}
              </Menunggu>
            )}
          </Langkah>
        </>
      )}

      {/* Cuma muncul kalau memang sudah ada yang dipilih. "Belum ada topik yang
          dipilih" di layar pertama tidak memberi tahu apa pun yang belum
          terlihat — tombol utama dialog sudah mati, dan ketiga langkahnya masih
          kosong. */}
      {chosen && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {chosenPrefix} <span className="font-medium">{topicLabel(chosen.group)}</span>
          <span className="text-blue-700/70"> · {chosen.subjectName}</span>
        </p>
      )}

      {/* Mapel, kelas, dan topik dimiliki Tera — Sora cuma membacanya. Tapi
          baris ini menunggu sampai orangnya benar-benar mencari dan tidak
          menemukan: entah pencariannya nihil, atau daftar topik kelasnya sudah
          terbentang di depan mata. Ditampilkan sejak layar pertama, ia menjawab
          pertanyaan yang belum ditanyakan siapa pun. */}
      {petunjukPerlu && (
        <p className="text-xs text-gray-400">Topiknya belum ada? {PETUNJUK_TERA}</p>
      )}
    </div>
  );
}

/**
 * Satu langkah bernomor: labelnya di atas, isinya di bawah.
 *
 * Isinya menjorok selebar bulatan nomor beserta jaraknya (`pl-7`), jadi tepi
 * kirinya lurus dengan huruf pertama labelnya, bukan dengan nomornya. Nomor itu
 * berdiri sendiri di luar kolom teks — dari situ ketiganya terbaca sebagai
 * urutan 1–2–3 di tepi kiri, sementara label dan isinya tetap satu kolom.
 *
 * Nomornya cuma penanda urutan, bukan penanda kemajuan: ia tidak berubah warna
 * ketika langkahnya terjawab. Yang terpilih sudah terbaca dari chip yang
 * menyala di dalam langkahnya sendiri, dan dari baris kesimpulan di bawah —
 * menyalakan nomornya pun berarti tiga tanda untuk satu hal yang sama.
 */
function Langkah({
  nomor,
  judul,
  children,
}: {
  nomor: number;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-gray-500">
          {nomor}
        </span>
        {judul}
      </p>
      {/* pl-7 = lebar bulatan (h-5/w-5) + gap-2 di atasnya. */}
      <div className="pl-7">{children}</div>
    </div>
  );
}

/** Langkah yang belum bisa dijawab: tetap berdiri, tapi mengatakan apa yang kurang. */
function Menunggu({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-gray-400">
      {children}
    </p>
  );
}

/** Garis dengan kata di tengahnya. */
function Pemisah({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs text-gray-400">
      <span className="h-px flex-1 bg-slate-200" />
      {children}
      <span className="h-px flex-1 bg-slate-200" />
    </p>
  );
}
