"use client";

import { useState } from "react";
import { QUESTION_TYPE_LABEL } from "@/lib/types";
import { parseImport, templatCsv, type ImportResult } from "@/lib/question-import";
import {
  contohSoalJson,
  parseSoalJson,
  type BarisJson,
  type HasilJson,
  type ItemJson,
} from "@/lib/soal-json";
import { useTopik } from "@/lib/topik";
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
 *
 * `groupId` null = JALUR PENGUKURAN. Butir bertopik tidak punya bab sejak
 * migrasi tera 148, jadi halaman Pengukuran mengimpor tanpa menanyakannya. Di
 * mode itu butir TANPA topik justru yang ditolak — ia tidak akan tersaji lewat
 * jalur mana pun, dan menyimpannya diam-diam berarti soal yang hilang di
 * database tanpa ada layar yang menampilkannya.
 */
export function ImportPanel({ groupId }: { groupId: string | null }) {
  // Kode topik yang benar-benar ada, supaya naskah bertopik salah ketik ditolak
  // SAAT BACA — bukan saat insert, yang akan menggagalkan seluruh berkas gara-
  // gara satu baris dan tidak memberi tahu baris mana.
  const { topik } = useTopik();
  const [nama, setNama] = useState<string | null>(null);
  // Dua pembaca, dua bentuk hasil. Yang sama pada keduanya — daftar baris
  // beserta masalahnya — itulah yang dipakai layar ini; sisanya dijaga per
  // bentuk saat dipakai.
  const [hasil, setHasil] = useState<ImportResult | HasilJson | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tersimpan, setTersimpan] = useState<number | null>(null);

  const tanpaBab = groupId === null;

  // Di jalur pengukuran, butir tanpa `topik` diperlakukan seperti baris
  // bermasalah: bukan galat berkasnya, tapi butir yang tidak punya tempat di
  // halaman ini. Berkas CSV seluruhnya jatuh ke sini — bentuk itu memang tidak
  // bisa membawa kode topik.
  const berTopik = (r: { item: unknown }) =>
    !tanpaBab || Boolean(r.item && "topik_id" in (r.item as object) && (r.item as ItemJson).topik_id);

  const siap = hasil?.rows.filter((r) => r.item && berTopik(r)) ?? [];
  const bermasalah = hasil?.rows.filter((r) => !r.item) ?? [];
  const tanpaTopik = hasil?.rows.filter((r) => r.item && !berTopik(r)) ?? [];
  // Hanya berkas JSON yang punya catatan — hal yang diabaikan tapi tidak
  // menghalangi penyimpanan. Dikatakan supaya data yang dibuang tidak hilang
  // diam-diam.
  const bercatatan = (hasil?.rows ?? []).filter(
    (r): r is BarisJson => "catatan" in r && Boolean((r as BarisJson).catatan),
  );

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
    const isi = await file.text();
    // JSON dikenali dari nama berkasnya, bukan ditebak dari isinya: berkas CSV
    // yang rusak dan berkas JSON yang rusak menghasilkan keluhan yang berbeda,
    // dan menebak salah berarti mengeluh tentang berkas yang bukan miliknya.
    const kodeSah = topik.length > 0 ? new Set(topik.map((t) => t.id)) : undefined;
    setHasil(/\.json$/i.test(file.name) ? parseSoalJson(isi, kodeSah) : parseImport(isi));
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

  // Blob, bukan tautan ke berkas statis: isinya dibangkitkan dari aturan
  // pembacaan yang sama, jadi contoh dan pembacanya tidak bisa berpisah —
  // contoh yang usang mengajarkan bentuk yang akan ditolak.
  function unduh(isi: string, namaBerkas: string, tipe: string) {
    const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
    const a = document.createElement("a");
    a.href = url;
    a.download = namaBerkas;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-full flex-col gap-3 text-gray-700">
      <p className="text-xs text-gray-500">
        <b>CSV</b> — satu baris satu soal, nama kolom di baris pertama; Excel: Simpan Sebagai → CSV.
        <br />
        <b>JSON</b> — daftar butir bergaya naskah soal, membawa penjelasan per opsi dan metadata
        pengukuran yang tidak muat di CSV.{" "}
        <button
          type="button"
          onClick={() => unduh(contohSoalJson(), "contoh-soal.json", "application/json;charset=utf-8")}
          className="font-medium text-blue-600 hover:underline"
        >
          Unduh contoh JSON
        </button>
        {" · "}
        <button
          type="button"
          onClick={() => unduh(templatCsv(), "templat-impor-soal.csv", "text/csv;charset=utf-8")}
          className="font-medium text-blue-600 hover:underline"
        >
          templat CSV
        </button>
      </p>

      <p className="text-sm font-medium text-gray-900">Pilih berkas</p>

      <input
        type="file"
        accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void baca(file);
        }}
        className="text-sm file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
      />

      {galat && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{galat}</p>}

      {tersimpan !== null && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {tanpaBab
            ? `${tersimpan} soal tersimpan sebagai draf. Verifikasi dulu sebelum disusun jadi paket.`
            : `${tersimpan} soal masuk ke topik ini.`}
        </p>
      )}

      {hasil?.fatal && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{hasil.fatal}</p>
      )}

      {hasil && !hasil.fatal && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium text-gray-900">{nama}</span> — {siap.length} soal siap
            {tanpaTopik.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <li className="font-medium">
                {tanpaTopik.length} butir tanpa topik pengukuran — tidak diimpor di sini. Butir
                untuk bab kurikulum diimpor dari halaman Bank Soal.
              </li>
              {tanpaTopik.slice(0, 20).map((r) => (
                <li key={r.nomor}>
                  Butir {r.nomor}
                  {r.prompt && <span className="text-amber-700"> ({potong(r.prompt)})</span>}
                </li>
              ))}
            </ul>
          )}

          {bermasalah.length > 0 && (
              <span className="text-amber-700">, {bermasalah.length} baris dilewati</span>
            )}
          </p>

          {"kolomAsing" in hasil && hasil.kolomAsing.length > 0 && (
            <p className="text-xs text-gray-500">
              Kolom yang tidak dikenali dan diabaikan: {hasil.kolomAsing.join(", ")}
            </p>
          )}

          {bercatatan.length > 0 && (
            // Bukan kegagalan: butirnya tetap tersimpan. Yang disebut di sini
            // hal yang diabaikan — pola SOLO di soal berjawaban tunggal,
            // penjelasan yang jumlahnya tidak sama dengan opsinya.
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {bercatatan.map((r) => (
                <li key={r.nomor}>
                  <span className="font-medium">Butir {r.nomor}</span> — {r.catatan}
                </li>
              ))}
            </ul>
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
        Impor soal
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
        Impor soal
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
