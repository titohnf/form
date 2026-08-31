"use client";

import type { McqOptions, QuestionOptions, QuestionType } from "@/lib/types";
import { labelTopik, useTopik } from "@/lib/topik";
import {
  ELEMEN_PROSES,
  KONTEKS_PISA,
  POLA_SOLO,
  SUMBER_PEMBUATAN,
  type ElemenProses,
  type MetadataPengukuran as Metadata,
} from "@/lib/metadata-pengukuran";

/**
 * Metadata pengukuran satu butir — yang membedakan soal yang bisa dikerjakan
 * dari soal yang bisa dipercaya sebagai alat ukur.
 *
 * Isinya menyesuaikan soalnya, bukan menampilkan semua field untuk semua tipe:
 * pola SOLO cuma punya arti pada multi-select, penjelasan per opsi cuma ada
 * kalau soalnya memang punya opsi, dan konteks PISA baru relevan C4 ke atas
 * (Rubrik Bagian 5) — untuk butir pilot yang berhenti di C3, menampilkannya
 * hanya menyodorkan keputusan yang tidak perlu diambil.
 *
 * Tidak punya tombol simpan sendiri. Ia menumpang "Simpan perubahan" milik
 * editor soalnya, karena ini bagian dari menulis butir — bukan pernyataan
 * tentang butir seperti status verifikasi, yang justru menyimpan seketika.
 */
export default function MetadataPengukuran({
  tipe,
  opsi,
  bloomLevel,
  nilai,
  onChange,
}: {
  tipe: QuestionType;
  opsi: QuestionOptions;
  bloomLevel: number | null | undefined;
  nilai: Metadata;
  onChange: (next: Metadata) => void;
}) {
  const { topik, belum: topikBelumAda } = useTopik();
  const choices = (opsi as McqOptions | null)?.choices ?? [];
  const punyaOpsi = tipe === "mcq_single" || tipe === "mcq_multi";
  const multiSelect = tipe === "mcq_multi";
  const c4KeAtas = (bloomLevel ?? 0) >= 4;

  function ubah(patch: Partial<Metadata>) {
    onChange({ ...nilai, ...patch });
  }

  function toggleElemen(value: ElemenProses) {
    const kini = nilai.elemen_proses ?? [];
    const next = kini.includes(value) ? kini.filter((v) => v !== value) : [...kini, value];
    ubah({ elemen_proses: next.length > 0 ? next : null });
  }

  function ubahPenjelasan(index: number, teks: string) {
    const kini = { ...(nilai.penjelasan_per_opsi ?? {}) };
    if (teks.trim()) kini[String(index)] = teks;
    else delete kini[String(index)];
    ubah({ penjelasan_per_opsi: Object.keys(kini).length > 0 ? kini : null });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <h3 className="text-sm font-semibold text-slate-800">Metadata pengukuran</h3>
      <p className="mt-1 text-xs text-gray-500">
        Dipakai untuk analisis distraktor dan menjaga bank soal tidak timpang — bukan ditampilkan
        ke murid.
      </p>

      {/* Topik pengukuran berdiri sendiri di atas, bukan berjajar dengan
          field lain: ia identitas ukur butir ini, bukan sekadar keterangan.
          Butir tanpa topik tetap tersimpan dan tetap bisa dipakai di kuis
          kelas — yang hilang cuma sumbangannya ke angka penguasaan.

          Disembunyikan seluruhnya kalau peta kompetensinya belum ada di
          lingkungan ini (migrasi 143 belum jalan), karena dropdown kosong
          tanpa penjelasan lebih membingungkan daripada tidak ada apa-apa. */}
      {!topikBelumAda && (
        <label className="mt-4 block">
          <span className="text-xs font-medium text-slate-700">Diukur sebagai</span>
          <select
            value={nilai.topik_id ?? ""}
            onChange={(e) => ubah({ topik_id: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tidak diukur — di luar peta kompetensi</option>
            {topik
              .filter((t) => t.aktif)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {labelTopik(t)}
                </option>
              ))}
            {/* Topik yang belum dibuka tetap bisa dipilih: soal boleh ditulis
                lebih dulu daripada topiknya dinyalakan, dan justru begitulah
                ekspansi berikutnya disiapkan. */}
            <optgroup label="Belum dibuka untuk murid">
              {topik
                .filter((t) => !t.aktif)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {labelTopik(t)}
                  </option>
                ))}
            </optgroup>
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            Beda dari topik kurikulum di bawah: yang ini menentukan penguasaan mana yang dihitung,
            bukan di bab mana soalnya muncul.
          </span>
        </label>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Sumber draf</span>
          <select
            value={nilai.sumber_pembuatan}
            onChange={(e) => ubah({ sumber_pembuatan: e.target.value as Metadata["sumber_pembuatan"] })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {SUMBER_PEMBUATAN.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {multiSelect && (
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Pola SOLO yang dirancang</span>
            <select
              value={nilai.pola_solo ?? ""}
              onChange={(e) =>
                ubah({ pola_solo: (e.target.value || null) as Metadata["pola_solo"] })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Belum ditetapkan</option>
              {POLA_SOLO.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — {p.arti}
                </option>
              ))}
            </select>
          </label>
        )}

        {c4KeAtas && (
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Konteks PISA</span>
            <select
              value={nilai.tag_konteks_pisa ?? ""}
              onChange={(e) =>
                ubah({ tag_konteks_pisa: (e.target.value || null) as Metadata["tag_konteks_pisa"] })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Belum ditetapkan</option>
              {KONTEKS_PISA.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-slate-700">Elemen proses yang ditekankan</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ELEMEN_PROSES.map((e) => {
            const aktif = (nilai.elemen_proses ?? []).includes(e.value);
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleElemen(e.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  aktif
                    ? "bg-blue-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:border-blue-400"
                }`}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {punyaOpsi && choices.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-700">Penjelasan per opsi</p>
          <p className="mt-1 text-xs text-gray-500">
            Untuk opsi salah, tulis miskonsepsi apa yang diwakilinya — itu yang membuat &ldquo;opsi
            B paling sering dipilih&rdquo; berguna nanti.
          </p>
          <div className="mt-2 space-y-2">
            {choices.map((choice, i) => (
              <label key={i} className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-xs font-medium text-slate-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                <input
                  value={(nilai.penjelasan_per_opsi ?? {})[String(i)] ?? ""}
                  onChange={(e) => ubahPenjelasan(i, e.target.value)}
                  placeholder={choice || "(opsi masih kosong)"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
