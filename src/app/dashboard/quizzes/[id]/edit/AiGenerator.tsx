"use client";

import { useState } from "react";
import { addGeneratedQuestions, type GeneratedQuestionInput } from "./actions";

export default function AiGenerator({
  quizId,
  nextOrderIndex,
}: {
  quizId: string;
  nextOrderIndex: number;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<GeneratedQuestionInput[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setDrafts([]);

    const formData = new FormData();
    formData.set("text", text);
    formData.set("count", String(count));
    if (file) formData.set("file", file);

    try {
      const res = await fetch(`/dashboard/quizzes/${quizId}/edit/generate`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal generate soal.");
        return;
      }
      setDrafts(data.questions ?? []);
      setSelected(new Set((data.questions ?? []).map((_: unknown, i: number) => i)));
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    setAdding(true);
    const chosen = drafts.filter((_, i) => selected.has(i));
    await addGeneratedQuestions(quizId, nextOrderIndex, chosen);
    setAdding(false);
    setDrafts([]);
    setText("");
    setFile(null);
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Materi (paste teks di sini)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="Tempel materi pelajaran di sini…"
        />
      </label>

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Atau upload PDF
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm">
          Jumlah soal
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || (!text.trim() && !file)}
          className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Membuat soal…" : "Generate Soal"}
        </button>
      </div>

      {drafts.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded bg-gray-50 p-3">
          <p className="text-sm font-medium">Draf soal ({drafts.length}) — pilih yang mau ditambahkan:</p>
          {drafts.map((q, i) => (
            <label key={i} className="flex items-start gap-2 rounded border border-gray-200 bg-white p-2 text-sm">
              <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1" />
              <div>
                <p className="font-medium">{q.prompt}</p>
                <ul className="mt-1 list-disc pl-5 text-gray-500">
                  {q.choices.map((c) => (
                    <li key={c} className={c === q.correct_answer ? "font-medium text-green-700" : ""}>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </label>
          ))}
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || selected.size === 0}
            className="self-start rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {adding ? "Menambahkan…" : `Tambah ${selected.size} Soal ke Kuis`}
          </button>
        </div>
      )}
    </div>
  );
}
