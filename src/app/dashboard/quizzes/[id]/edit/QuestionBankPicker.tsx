"use client";

import { useMemo, useState, useTransition } from "react";
import type { QuestionBankItem } from "@/lib/types";
import { MathText } from "@/lib/latex";

export interface BankTopicGroup {
  id: string;
  label: string;
  subjectName: string;
  itemIds: string[];
}

/**
 * Pemilih soal dari Latihan Soal: centang beberapa sekaligus, dikelompokkan
 * per topik.
 *
 * Sebelumnya satu dropdown dan satu tombol — satu soal per klik, tiap klik
 * memuat ulang halaman. Untuk meracik try out dari 30 soal itu 30 putaran
 * pilih–klik–tunggu, tanpa penanda mana yang sudah masuk.
 *
 * Soal yang sudah ada di paket tetap ditampilkan tapi dikunci, bukan
 * disembunyikan: kalau hilang dari daftar, admin bingung mencarinya dan tidak
 * tahu bahwa ia memang sudah dipakai.
 */
export default function QuestionBankPicker({
  items,
  topics,
  addedBankItemIds,
  onAdd,
}: {
  items: QuestionBankItem[];
  topics: BankTopicGroup[];
  /** Id soal bank yang sudah ada di paket ini. */
  addedBankItemIds: string[];
  onAdd: (bankItemIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const added = useMemo(() => new Set(addedBankItemIds), [addedBankItemIds]);

  const taggedIds = useMemo(
    () => new Set(topics.flatMap((t) => t.itemIds)),
    [topics],
  );

  // Soal tanpa topik tetap bisa dipakai — hanya tidak muncul di latihan mandiri
  // murid. Menyembunyikannya di sini berarti soal itu tidak bisa dipakai sama
  // sekali sampai seseorang menandainya.
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (id: string) =>
      !needle || (itemById.get(id)?.prompt ?? "").toLowerCase().includes(needle);

    const withTopics = topics
      .map((t) => ({ ...t, itemIds: t.itemIds.filter(matches) }))
      .filter((t) => t.itemIds.length > 0);

    const untagged = items.filter((i) => !taggedIds.has(i.id) && matches(i.id)).map((i) => i.id);
    return untagged.length > 0
      ? [...withTopics, { id: "__untagged__", label: "Tanpa topik", subjectName: "", itemIds: untagged }]
      : withTopics;
  }, [topics, items, itemById, taggedIds, query]);

  const selectableIn = (ids: string[]) => ids.filter((id) => !added.has(id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleTopic(ids: string[]) {
    const pickable = selectableIn(ids);
    const allOn = pickable.every((id) => selected.includes(id));
    setSelected((prev) =>
      allOn ? prev.filter((id) => !pickable.includes(id)) : [...new Set([...prev, ...pickable])],
    );
  }

  function add() {
    startTransition(() => {
      onAdd(selected);
      setSelected([]);
      setOpen(false);
    });
  }

  if (items.length === 0) return null;

  const availableCount = items.filter((i) => !added.has(i.id)).length;

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
      >
        {open ? "Tutup Latihan Soal" : `+ Ambil dari Latihan Soal (${availableCount} tersedia)`}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari isi soal…"
            aria-label="Cari soal di Latihan Soal"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
            {sections.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-500">
                Tidak ada soal yang cocok dengan pencarian itu.
              </p>
            )}

            {sections.map((topic) => {
              const pickable = selectableIn(topic.itemIds);
              const allOn = pickable.length > 0 && pickable.every((id) => selected.includes(id));
              return (
                <div key={topic.id} className="rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      {topic.subjectName && (
                        <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                          {topic.subjectName}
                        </p>
                      )}
                      <p className="truncate text-sm font-medium text-gray-900">
                        {topic.label}{" "}
                        <span className="font-normal text-gray-400">({topic.itemIds.length})</span>
                      </p>
                    </div>
                    {pickable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleTopic(topic.itemIds)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-slate-50"
                      >
                        {allOn ? "Batal pilih" : "Pilih semua"}
                      </button>
                    )}
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {topic.itemIds.map((id) => {
                      const item = itemById.get(id);
                      if (!item) return null;
                      const isAdded = added.has(id);
                      return (
                        <li key={id}>
                          <label
                            className={`flex items-start gap-2 px-3 py-2 text-sm ${
                              isAdded ? "cursor-not-allowed bg-slate-50" : "cursor-pointer hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(id)}
                              disabled={isAdded}
                              onChange={() => toggle(id)}
                              className="mt-1 shrink-0"
                            />
                            <span className={`min-w-0 flex-1 ${isAdded ? "text-gray-400" : "text-gray-700"}`}>
                              <span className="line-clamp-2 block">
                                <MathText text={item.prompt || "(soal tanpa pertanyaan)"} />
                              </span>
                              {isAdded && (
                                <span className="text-xs text-gray-400">sudah ada di paket ini</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={add}
              disabled={selected.length === 0 || pending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {pending
                ? "Menambahkan…"
                : `Tambah ${selected.length || ""} soal terpilih`.replace("  ", " ")}
            </button>
            {selected.length > 0 && !pending && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-xs text-gray-500 hover:underline"
              >
                Kosongkan pilihan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
