"use client";

import { useState } from "react";
import type { QuestionBankItem } from "@/lib/types";

export default function QuestionBankPicker({
  items,
  onPick,
}: {
  items: QuestionBankItem[];
  onPick: (bankItemId: string) => void;
}) {
  const [selected, setSelected] = useState("");

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Pilih soal dari Bank Soal…</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.prompt.slice(0, 60)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onPick(selected)}
        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium whitespace-nowrap text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
      >
        Tambah dari Bank
      </button>
    </div>
  );
}
