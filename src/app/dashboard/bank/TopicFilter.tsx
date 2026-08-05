"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { topicLabel } from "@/lib/curriculum";
import type { SubjectTopics } from "./BankItem";
import { Modal, TopicPicker, findTopic } from "./TopicPicker";

/**
 * Penyaring topik, memakai pemilih yang sama dengan tombol Soal Baru.
 *
 * Sebelumnya satu <select> berisi seluruh 175 topik — penyakit yang sama dengan
 * dialog pembuat soal, cuma pindah tempat. Sekarang keduanya menyempit lewat
 * mapel dan kelas, jadi memilih topik terasa sama di mana pun dilakukan.
 *
 * Dibungkus tombol, bukan dibentangkan di halaman: penyaringan adalah pekerjaan
 * sesekali, dan pemilih setinggi itu akan mendorong daftar topiknya keluar layar
 * setiap saat demi sesuatu yang jarang dipakai.
 */
export default function TopicFilter({
  subjects,
  value,
}: {
  subjects: SubjectTopics[];
  value: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();

  const active = findTopic(subjects, value);

  function apply(groupId: string) {
    setOpen(false);
    startTransition(() => {
      router.push(groupId ? `/dashboard/bank?topic=${groupId}` : "/dashboard/bank");
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5">
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
        className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-gray-400"
      >
        {active ? (
          <>
            {topicLabel(active.group)}
            <span className="text-gray-400"> · {active.subjectName}</span>
          </>
        ) : (
          <span className="text-gray-500">Semua topik</span>
        )}
      </button>

      {/* Hanya muncul kalau ada yang bisa dibatalkan — tombol reset yang selalu
          ada di samping filter kosong cuma menambah benda tanpa guna. */}
      {value && (
        <button
          type="button"
          disabled={pending}
          onClick={() => apply("")}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {pending ? "Memuat…" : "Semua topik"}
        </button>
      )}

      {open && (
        <Modal title="Tampilkan topik yang mana?" onClose={() => setOpen(false)}>
          <div className="mt-4 flex flex-col gap-4">
            <TopicPicker
              subjects={subjects}
              value={draft}
              onChange={setDraft}
              chosenPrefix="Menampilkan"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!draft}
                onClick={() => apply(draft)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                Tampilkan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
