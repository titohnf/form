"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createBankItem } from "./actions";
import type { SubjectTopics } from "./BankItem";
import { Modal, TopicPicker } from "./TopicPicker";

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

/**
 * Tombol di header, untuk topik yang belum punya soal sama sekali: topik seperti
 * itu tidak dirender di daftar, jadi tombol per-topik tidak bisa menjangkaunya.
 * Pemilihnya memuat seluruh topik, bukan hanya yang terpakai.
 */
export function NewItemDialog({ subjects }: { subjects: SubjectTopics[] }) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");

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
        <Modal
          title="Soal baru di topik mana?"
          description="Soal disimpan per kelas dan topik. Topik lain bisa ditambahkan nanti dari kartu soalnya."
          onClose={close}
        >
          <form action={createBankItem} className="mt-4 flex flex-col gap-4">
            <TopicPicker
              subjects={subjects}
              value={groupId}
              onChange={setGroupId}
              name="group"
              chosenPrefix="Dibuat di"
            />

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
        </Modal>
      )}
    </>
  );
}
