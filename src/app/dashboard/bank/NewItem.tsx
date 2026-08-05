"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CurriculumTopicGroup } from "@/lib/types";
import { topicLabel } from "@/lib/curriculum";
import { createBankItem } from "./actions";
import type { SubjectTopics } from "./BankItem";

/**
 * Tombol submit yang menunjukkan kliknya masuk. Tanpa ini tombolnya diam total
 * selama server action berjalan, dan tombol yang diam terbaca sebagai tombol
 * yang rusak.
 */
function SubmitButton({
  className,
  idle,
  busy,
  disabled,
}: {
  className: string;
  idle: string;
  busy: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${className} disabled:opacity-60`}
    >
      {pending ? busy : idle}
    </button>
  );
}

/**
 * Tombol pembuat soal di dalam satu topik: kamarnya tersirat dari tempat
 * mengklik, jadi tidak ada yang perlu ditanyakan.
 */
export function NewItemInTopic({ groupId }: { groupId: string }) {
  return (
    <form action={createBankItem}>
      <input type="hidden" name="group" value={groupId} />
      <SubmitButton
        className="w-full rounded-xl border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
        idle="+ Soal Baru di topik ini"
        busy="Membuat…"
      />
    </form>
  );
}

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

const chip = "rounded-full border px-3 py-1.5 text-sm transition-colors";
const chipOn = "border-blue-600 bg-blue-600 text-white";
const chipOff = "border-slate-300 text-gray-700 hover:border-gray-400 hover:bg-slate-50";

/**
 * Pemilih topik dua langkah: mapel, lalu kelas, baru daftar topiknya. Satu select
 * berisi seluruh topik pernah dicoba dan tidak terpakai — 175 baris datar terlalu
 * banyak untuk dibaca, apalagi 111 di antaranya Matematika. Menyempitkan lewat
 * mapel dan kelas menyisakan sekitar sepuluh topik, jumlah yang bisa dipindai
 * sekali lihat.
 *
 * Kotak pencarian melompati kedua langkah itu untuk orang yang sudah tahu nama
 * topiknya dan tidak mau mengklik dua kali dulu.
 */
function TopicPicker({
  subjects,
  value,
  onChange,
}: {
  subjects: SubjectTopics[];
  value: string;
  onChange: (groupId: string) => void;
}) {
  const [search, setSearch] = useState("");
  // Satu mapel tidak perlu ditanyakan.
  const [subjectId, setSubjectId] = useState(subjects.length === 1 ? subjects[0].subjectId : "");
  const [grade, setGrade] = useState("");

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
  // diketik, sementara tombol Buat Soal tetap menyala. Menuliskannya kembali di
  // bawah membuat "akan dibuat di mana" tidak pernah jadi tebakan.
  const chosen = subjects
    .flatMap((s) => s.groups.map((group) => ({ subjectName: s.subjectName, group })))
    .find((entry) => entry.group.id === value);

  const subject = subjects.find((s) => s.subjectId === subjectId) ?? null;
  const grades = subject
    ? [...new Set(subject.groups.map((g) => g.grade_level))].sort(byGradeNumber)
    : [];
  const topics = subject && grade ? subject.groups.filter((g) => g.grade_level === grade) : [];

  function pickSubject(id: string) {
    setSubjectId(id);
    // Kelas 7 di Matematika bukan Kelas 7 di IPA; pilihan lama tidak boleh terbawa.
    setGrade("");
    onChange("");
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="group" value={value} />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari topik…"
        aria-label="Cari topik"
        autoFocus
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {found ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          {found.length === 0 ? (
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
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <button
                key={s.subjectId}
                type="button"
                onClick={() => pickSubject(s.subjectId)}
                className={`${chip} ${s.subjectId === subjectId ? chipOn : chipOff}`}
              >
                {s.subjectName}
              </button>
            ))}
          </div>

          {subject && (
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGrade(g);
                    onChange("");
                  }}
                  className={`${chip} ${g === grade ? chipOn : chipOff}`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {subject && grade && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              {topics.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onChange(group.id)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    value === group.id ? "bg-blue-50 font-medium text-blue-700" : "hover:bg-slate-50"
                  }`}
                >
                  {withinGrade(group)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-sm text-gray-500">
        {chosen ? (
          <>
            Dibuat di{" "}
            <span className="font-medium text-gray-900">{topicLabel(chosen.group)}</span>
            <span className="text-gray-400"> · {chosen.subjectName}</span>
          </>
        ) : (
          "Belum ada topik yang dipilih."
        )}
      </p>
    </div>
  );
}

/**
 * Tombol di header, untuk topik yang belum punya soal sama sekali: topik seperti
 * itu tidak dirender di daftar, jadi tombol per-topik tidak bisa menjangkaunya.
 * Pemilihnya memuat seluruh topik, bukan hanya yang terpakai.
 */
export function NewItemDialog({ subjects }: { subjects: SubjectTopics[] }) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setGroupId("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={subjects.length === 0}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        + Soal Baru
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6"
          onClick={close}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900">Soal baru di topik mana?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Soal disimpan per kelas dan topik. Topik lain bisa ditambahkan nanti dari kartu
              soalnya.
            </p>

            <form action={createBankItem} className="mt-4 flex flex-col gap-4">
              <TopicPicker subjects={subjects} value={groupId} onChange={setGroupId} />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
                >
                  Batal
                </button>
                <SubmitButton
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  idle="Buat Soal"
                  busy="Membuat…"
                  disabled={!groupId}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
