"use client";

import { useState } from "react";
import { QUESTION_TYPE_LABEL } from "@/lib/types";
import { parseImport, templatCsv, type ImportResult } from "@/lib/question-import";
import { addImportedBankItems } from "./actions";
import type { SubjectTopics } from "./BankItem";
import { Modal, TopicPicker } from "./TopicPicker";

/**
 * Isi panel impor: memilih berkas, membacanya, lalu menyimpannya ke satu topik.
 *
 * Berkasnya dibaca di peramban, bukan diunggah: seluruh penerjemahannya
 * deterministik dan tidak butuh apa pun dari server, jadi orang bisa melihat
 * hasil bacanya seketika — termasuk baris yang bermasalah — sebelum satu soal
 * pun tersimpan. Yang menyeberang ke server hanya baris yang sudah bersih.
 *
 * Satu berkas selalu satu topik, di mana pun panel ini berdiri. Berkas berisi
 * banyak topik menuntut kolom topik yang harus cocok dengan taksonomi Tera
 * baris demi baris, dan salah satu huruf di sana berarti soal mendarat di
 * kelas yang keliru.
 *
 * Panelnya sendiri tanpa bingkai dan tanpa judul: yang memanggilnya — kartu di
 * halaman topik, atau dialog di halaman depan — yang tahu di mana ia berdiri.
 * `key`-nya groupId di sisi pemanggil, supaya berganti topik membuang hasil
 * baca topik sebelumnya alih-alih menyimpannya ke tempat yang salah.
 */
export function ImportPanel({ groupId }: { groupId: string }) {
  const [nama, setNama] = useState<string | null>(null);
  const [hasil, setHasil] = useState<ImportResult | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tersimpan, setTersimpan] = useState<number | null>(null);

  const siap = hasil?.rows.filter((r) => r.item) ?? [];
  const bermasalah = hasil?.rows.filter((r) => !r.item) ?? [];

  async function baca(file: File) {
    setGalat(null);
    setTersimpan(null);
    setNama(file.name);
    // .xlsx dan .xls itu berkas biner. Dibaca sebagai teks ia jadi sampah yang
    // gagal dengan alasan yang tidak ada hubungannya ("tidak ada kolom
    // pertanyaan"), jadi ia ditolak di sini dengan jalan keluarnya sekalian.
    if (/\.xlsx?$/i.test(file.name)) {
      setHasil(null);
      setGalat(
        "Berkas Excel belum bisa dibaca langsung. Di Excel: Berkas → Simpan Sebagai → CSV, lalu pilih berkas CSV-nya.",
      );
      return;
    }
    setHasil(parseImport(await file.text()));
  }

  async function simpan() {
    if (!hasil) return;
    setMenyimpan(true);
    setGalat(null);
    try {
      const n = await addImportedBankItems(
        groupId,
        siap.map((r) => r.item!),
      );
      setTersimpan(n);
      setHasil(null);
      setNama(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan soal.");
    } finally {
      setMenyimpan(false);
    }
  }

  function unduhTemplat() {
    // Blob, bukan tautan ke berkas statis: isinya dibangkitkan dari aturan
    // pembacaan yang sama, jadi templat dan pembacanya tidak bisa berpisah.
    const url = URL.createObjectURL(new Blob([templatCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "templat-impor-soal.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-gray-700">
      <p className="text-xs text-gray-500">
        Satu baris satu soal, nama kolom di baris pertama. Excel: Simpan Sebagai → CSV.{" "}
        <button
          type="button"
          onClick={unduhTemplat}
          className="font-medium text-blue-600 hover:underline"
        >
          Unduh templat
        </button>
      </p>

      <p className="text-sm font-medium text-gray-900">Pilih berkas</p>

      <input
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void baca(file);
        }}
        className="text-sm file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
      />

      {galat && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{galat}</p>}

      {tersimpan !== null && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {tersimpan} soal masuk ke topik ini.
        </p>
      )}

      {hasil?.fatal && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{hasil.fatal}</p>
      )}

      {hasil && !hasil.fatal && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium text-gray-900">{nama}</span> — {siap.length} soal siap
            {bermasalah.length > 0 && (
              <span className="text-amber-700">, {bermasalah.length} baris dilewati</span>
            )}
          </p>

          {hasil.kolomAsing.length > 0 && (
            <p className="text-xs text-gray-500">
              Kolom yang tidak dikenali dan diabaikan: {hasil.kolomAsing.join(", ")}
            </p>
          )}

          {bermasalah.length > 0 && (
            // Barisnya disebut nomornya seperti yang terlihat di Excel, supaya
            // yang harus diperbaiki bisa langsung dicari di berkas aslinya.
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              {bermasalah.map((r) => (
                <li key={r.nomor}>
                  <span className="font-medium">Baris {r.nomor}</span> — {r.masalah}
                  {r.prompt && <span className="text-amber-700"> ({potong(r.prompt)})</span>}
                </li>
              ))}
            </ul>
          )}

          {siap.length > 0 && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg bg-white p-3 text-sm">
              {siap.slice(0, 50).map((r) => (
                <li key={r.nomor} className="flex gap-2">
                  <span className="shrink-0 text-xs text-gray-400">
                    {QUESTION_TYPE_LABEL[r.item!.type]}
                  </span>
                  <span className="min-w-0 truncate">{r.prompt}</span>
                </li>
              ))}
              {siap.length > 50 && (
                <li className="text-xs text-gray-400">…dan {siap.length - 50} lagi</li>
              )}
            </ul>
          )}

          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan || siap.length === 0}
            className="self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {menyimpan ? "Menyimpan…" : `Impor ${siap.length} soal`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Tombol impor di halaman satu topik. Topiknya tersirat dari halaman tempat ia
 * berdiri, sama seperti "+ Soal Baru", jadi tidak ada yang perlu ditanyakan
 * sebelum berkasnya dipilih.
 */
export default function ImportDialog({ groupId, topic }: { groupId: string; topic: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        Impor CSV
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Impor soal ke {topic}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          Tutup
        </button>
      </div>
      <ImportPanel groupId={groupId} />
    </div>
  );
}

/**
 * Tombol impor di halaman depan Bank Soal, sebelah "+ Soal Baru".
 *
 * Halaman depan adalah daftar topik, jadi tidak ada topik yang tersirat di
 * sini — ia ditanyakan lebih dulu dengan pemilih yang sama seperti soal baru.
 * Tanpa pintu ini, mengimpor sekumpulan soal berarti menemukan dulu barisnya di
 * tabel, dan topik yang masih kosong justru yang paling butuh diimpori.
 *
 * Panelnya baru muncul setelah topiknya dipilih: memilih berkas sebelum tahu ia
 * mendarat di mana adalah cara tercepat menaruh dua ratus soal di kelas yang
 * keliru.
 */
export function ImportGlobalDialog({ subjects }: { subjects: SubjectTopics[] }) {
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
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
      >
        Impor CSV
      </button>

      {open && (
        <Modal
          title="Impor soal ke topik mana?"
          description="Satu berkas satu topik. Soalnya baru tersimpan setelah hasil bacanya terlihat."
          onClose={close}
        >
          <div className="mt-4 flex flex-col gap-4">
            <TopicPicker
              subjects={subjects}
              value={groupId}
              onChange={setGroupId}
              chosenPrefix="Diimpor ke"
            />

            {groupId && <ImportPanel key={groupId} groupId={groupId} />}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
            >
              Tutup
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function potong(teks: string): string {
  return teks.length > 60 ? `${teks.slice(0, 60)}…` : teks;
}
