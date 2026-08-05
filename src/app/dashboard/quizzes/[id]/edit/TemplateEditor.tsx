"use client";

import { useMemo, useState } from "react";
import { FUNCTION_NAMES } from "@/lib/expr";
import { generate, templateIssue, type QuestionTemplate } from "@/lib/question-template";
import type { QuestionOptions } from "@/lib/types";

const EMPTY: QuestionTemplate = {
  prompt: "",
  params: [{ name: "a", min: 2, max: 9 }],
  constraints: [],
  answer: "a",
  distractors: [],
};

const field = "w-full rounded border border-gray-300 px-3 py-2 text-sm";

function lines(values: string[]): string {
  return values.join("\n");
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Penulis soal berparameter: rentang angka, syarat, dan rumus jawaban.
 *
 * Ditutup secara bawaan dan hanya muncul untuk pilihan ganda. Sebagian besar
 * soal tidak punya angka untuk divariasikan — memaksa setiap penulis melewati
 * bagian ini akan membuat menulis soal biasa terasa lebih berat tanpa alasan.
 *
 * Pratinjaunya penting, bukan hiasan: rumus jawaban yang salah baru ketahuan
 * saat murid mengerjakan remedialnya, dan saat itu sudah terlambat. Di sini
 * penulisnya bisa mengundi beberapa kali dan melihat sendiri apakah angkanya
 * masuk akal.
 */
export default function TemplateEditor({
  prompt,
  options,
  value,
  onChange,
  onApply,
}: {
  /** Pertanyaan soal saat ini, dipakai sebagai titik awal teks bertemplat. */
  prompt: string;
  options: QuestionOptions;
  value: QuestionTemplate | null;
  onChange: (template: QuestionTemplate | null) => void;
  /** Menulis varian ke soalnya: pertanyaan, pilihan, dan kunci sekaligus. */
  onApply: (variant: { prompt: string; choices: string[]; correct: string }) => void;
}) {
  const [preview, setPreview] = useState<{ prompt: string; choices: string[]; key: string } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  const issue = useMemo(() => (value ? templateIssue(value) : null), [value]);

  function patch(changes: Partial<QuestionTemplate>) {
    onChange({ ...(value ?? EMPTY), ...changes });
  }

  function draw() {
    if (!value) return;
    try {
      const variant = generate(value, options);
      setPreview({
        prompt: variant.prompt,
        choices: (variant.options as { choices?: string[] })?.choices ?? [],
        key: String(variant.correct_answer),
      });
      setPreviewError(null);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "Gagal mengundi varian.");
    }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-xs text-gray-500">
        Soal berparameter{" "}
        {value ? (
          issue ? (
            <span className="text-amber-600">— {issue}</span>
          ) : (
            <span className="text-gray-400">— aktif</span>
          )
        ) : (
          <span className="text-gray-400">— tidak aktif</span>
        )}
      </summary>

      <p className="mt-2 text-xs text-gray-500">
        Angkanya diundi ulang saat soal ini disalin ke paket Remedial, jadi murid tidak bisa sekadar
        menghafal jawabannya. Tulis <code>{"{{a * b}}"}</code> di pertanyaan untuk menyisipkan hasil
        hitungan. Fungsi tersedia: {FUNCTION_NAMES.join(", ")}.
      </p>

      {!value ? (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY, prompt })}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
        >
          Jadikan soal berparameter
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">
              Pertanyaan bertemplat — pakai {"{{rumus}}"} untuk angka yang berubah
            </span>
            <textarea
              value={value.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              rows={2}
              placeholder="Berapa {{a * b}} : {{b}} ?"
              className={field}
            />
            <span className="text-xs text-gray-400">
              Yang dibaca murid adalah pertanyaan di atas kotak ini, bukan yang ini. Tekan
              &ldquo;Terapkan varian&rdquo; untuk mengisinya dengan salah satu undian.
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-500">Parameter</span>
            {value.params.map((param, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={param.name}
                  onChange={(e) => {
                    const params = [...value.params];
                    params[index] = { ...param, name: e.target.value };
                    patch({ params });
                  }}
                  aria-label="Nama parameter"
                  className="w-24 rounded border border-gray-300 px-2 py-1"
                />
                {(["min", "max", "step"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1 text-xs text-gray-500">
                    {key}
                    <input
                      type="number"
                      value={param[key] ?? (key === "step" ? 1 : 0)}
                      onChange={(e) => {
                        const params = [...value.params];
                        params[index] = { ...param, [key]: Number(e.target.value) };
                        patch({ params });
                      }}
                      className="w-20 rounded border border-gray-300 px-2 py-1"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => patch({ params: value.params.filter((_, i) => i !== index) })}
                  className="text-gray-400 hover:text-red-600"
                  aria-label="Hapus parameter"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({ params: [...value.params, { name: "", min: 1, max: 10, step: 1 }] })
              }
              className="self-start text-xs text-gray-500 hover:underline"
            >
              + Tambah parameter
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">
              Syarat — satu per baris; varian yang gagal diundi ulang
            </span>
            <textarea
              value={lines(value.constraints)}
              onChange={(e) => patch({ constraints: parseLines(e.target.value) })}
              rows={2}
              placeholder="a &lt; b"
              className={`${field} font-mono`}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Rumus kunci jawaban</span>
            <input
              value={value.answer}
              onChange={(e) => patch({ answer: e.target.value })}
              placeholder="a * b"
              className={`${field} font-mono`}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">
              Rumus pengecoh — satu per baris, urut sesuai pilihan salah
            </span>
            <textarea
              value={lines(value.distractors)}
              onChange={(e) => patch({ distractors: parseLines(e.target.value) })}
              rows={3}
              placeholder={"a + b\na * b - a"}
              className={`${field} font-mono`}
            />
            <span className="text-xs text-gray-400">
              Tiap pengecoh sebaiknya hasil satu kekeliruan tertentu, bukan angka asal — itu yang
              membuat soalnya masih bisa menunjukkan di mana murid keliru.
            </span>
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={value.thousands ?? false}
              onChange={(e) => patch({ thousands: e.target.checked })}
            />
            Tulis dengan pemisah ribuan (12.000)
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={draw}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
            >
              Undi contoh
            </button>
            <button
              type="button"
              disabled={!preview}
              onClick={() => {
                if (!preview) return;
                onApply({ prompt: preview.prompt, choices: preview.choices, correct: preview.key });
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              Terapkan varian ke soal
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setPreview(null);
                setPreviewError(null);
              }}
              className="text-sm text-gray-500 hover:underline"
            >
              Matikan
            </button>
          </div>

          {previewError && <p className="text-sm text-red-700">{previewError}</p>}

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p>{preview.prompt}</p>
              <ul className="mt-2 flex flex-col gap-0.5 text-gray-600">
                {preview.choices.map((choice, i) => (
                  <li key={i} className={choice === preview.key ? "font-medium text-green-700" : ""}>
                    {choice}
                    {choice === preview.key && " ✓"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
