"use client";

import Link from "next/link";
import { useState } from "react";
import type { SubjectTopics } from "./BankItem";
import { Modal, TopicPicker } from "./TopicPicker";

/**
 * Jalan ke soal baru: sebuah TAUTAN, bukan formulir.
 *
 * Menekannya tidak lagi menyisipkan apa pun ke bank — ia cuma membuka halaman
 * draf. Barisnya baru lahir saat draf itu disimpan, jadi berubah pikiran di
 * tengah jalan tidak meninggalkan soal kosong yang harus dibersihkan orang
 * lain.
 *
 * `compact` untuk yang duduk di kepala halaman yang gelap; yang di kaki daftar
 * tetap melebar, karena di sana ia sekaligus penanda daftarnya sudah habis.
 */
export function NewItemInTopic({ groupId, compact }: { groupId: string; compact?: boolean }) {
  return (
    <Link
      href={`/dashboard/bank/soal/baru?dari=${groupId}`}
      className={
        compact
          ? "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
          : "block w-full rounded-xl border border-dashed border-slate-300 bg-white py-3 text-center text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
      }
    >
      {compact ? "+ Soal Baru" : "+ Soal Baru di topik ini"}
    </Link>
  );
}

/**
 * Tombol di header halaman depan, untuk topik yang belum punya soal sama
 * sekali: topik seperti itu tidak punya baris untuk diklik, jadi tombol
 * per-topik tidak bisa menjangkaunya. Pemilihnya memuat seluruh topik, bukan
 * hanya yang terpakai.
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
          <div className="mt-4 flex flex-col gap-4">
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
              {/* Tautan yang dimatikan selama topiknya belum dipilih, bukan
                  tombol kirim: yang dituju halaman draf, dan tidak ada apa pun
                  yang dikirim ke server di langkah ini. */}
              {groupId ? (
                <Link
                  href={`/dashboard/bank/soal/baru?dari=${groupId}`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Tulis Soal
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-60">
                  Tulis Soal
                </span>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
