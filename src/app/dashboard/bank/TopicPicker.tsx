"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurriculumTopicGroup } from "@/lib/types";
import { topicLabel } from "@/lib/curriculum";
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
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg"
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
 * Pemilih topik dua langkah: mapel, lalu kelas, baru daftar topiknya. Satu select
 * berisi seluruh topik pernah dicoba dan tidak terpakai — 175 baris datar terlalu
 * banyak untuk dibaca, apalagi 111 di antaranya Matematika. Menyempitkan lewat
 * mapel dan kelas menyisakan sekitar sepuluh topik, jumlah yang bisa dipindai
 * sekali lihat.
 *
 * Kotak pencarian melompati kedua langkah itu untuk orang yang sudah tahu nama
 * topiknya dan tidak mau mengklik dua kali dulu.
 *
 * Dipakai dua tempat dengan maksud berbeda — memilih kamar soal baru, dan
 * menyaring daftar — jadi `name` dan kalimat penutupnya ikut menyesuaikan.
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
  // diketik, sementara tombolnya tetap menyala. Menuliskannya kembali di bawah
  // membuat "yang terpilih apa" tidak pernah jadi tebakan.
  const chosen = findTopic(subjects, value);

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
      {name && <input type="hidden" name={name} value={value} />}

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
            {chosenPrefix} <span className="font-medium text-gray-900">{topicLabel(chosen.group)}</span>
            <span className="text-gray-400"> · {chosen.subjectName}</span>
          </>
        ) : (
          "Belum ada topik yang dipilih."
        )}
      </p>
    </div>
  );
}
