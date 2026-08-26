"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MathText } from "./latex";

/**
 * One toolbar entry. `snippet` is inserted at the cursor; the caret lands on the
 * first `#` (removed on insert) so the tutor can type straight into the slot.
 */
const snippets: { label: string; title: string; snippet: string }[] = [
  { label: "a⁄b", title: "Pecahan", snippet: "$\\frac{#}{ }$" },
  { label: "x²", title: "Pangkat", snippet: "$x^{#}$" },
  { label: "x₁", title: "Indeks bawah", snippet: "$x_{#}$" },
  { label: "√", title: "Akar", snippet: "$\\sqrt{#}$" },
  { label: "×", title: "Kali", snippet: "$\\times$#" },
  { label: "÷", title: "Bagi", snippet: "$\\div$#" },
  { label: "±", title: "Plus minus", snippet: "$\\pm$#" },
  { label: "≤", title: "Kurang dari sama dengan", snippet: "$\\leq$#" },
  { label: "≥", title: "Lebih dari sama dengan", snippet: "$\\geq$#" },
  { label: "≠", title: "Tidak sama dengan", snippet: "$\\neq$#" },
  { label: "π", title: "Pi", snippet: "$\\pi$#" },
  { label: "°", title: "Derajat", snippet: "$^\\circ$#" },
  { label: "Σ", title: "Sigma (jumlah)", snippet: "$\\sum_{i=1}^{n}#$" },
  { label: "rumus blok", title: "Rumus di baris sendiri", snippet: "$$#$$" },
];

/**
 * Text field with a LaTeX toolbar and a live KaTeX preview, so tutors can write
 * math without knowing the `$...$` syntax by heart. Renders a plain textarea
 * when `rows` is given, otherwise a single-line input. Controlled: the owner
 * keeps the raw LaTeX and decides when to persist it, and the student page
 * renders that same string with <MathText>.
 */
export default function MathField({
  value,
  onChange,
  rows,
  required,
  placeholder,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  const [showToolbar, setShowToolbar] = useState(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  // Kotaknya setinggi isinya. Soal panjang — apalagi yang punya beberapa
  // paragraf — sebelumnya harus dibaca lewat jendela dua baris sambil
  // menggulung, jadi memeriksa kalimat yang baru ditulis berarti kehilangan
  // kalimat sebelumnya dari layar. `rows` tetap jadi tinggi minimumnya: dengan
  // height:auto textarea kembali diukur oleh `rows`, dan scrollHeight tidak
  // pernah lebih kecil dari itu.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rows) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, rows]);

  function insert(snippet: string) {
    const el = ref.current;
    const caretSlot = snippet.indexOf("#");
    const text = snippet.replace("#", "");

    if (!el) {
      onChange(value + text);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + text + value.slice(end);
    const caret = start + (caretSlot === -1 ? text.length : caretSlot);

    // Write to the DOM and place the caret synchronously, then tell React. The
    // state update resolves to the same string, so React leaves the node alone
    // and the caret stays in the slot — doing this in an effect or rAF instead
    // loses the race against the tutor's next keystroke.
    el.value = next;
    el.focus();
    el.setSelectionRange(caret, caret);
    onChange(next);
  }

  // 16px, bukan mengikuti wadahnya: isi soal — pertanyaan, pilihan jawaban,
  // pernyataan — dibaca murid sebesar itu, dan menulisnya di kotak 14px membuat
  // panjang baris di editor berbohong tentang panjangnya nanti. Kebetulan yang
  // membantu: Safari iOS berhenti memperbesar halaman sendiri saat kolom di
  // bawah 16px difokus.
  const fieldClass = "w-full rounded border border-gray-300 px-3 py-2 text-base";
  const hasMath = value.includes("$");

  return (
    <div className="flex flex-col gap-1">
      {rows ? (
        <textarea
          ref={ref}
          rows={rows}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowToolbar(true)}
          // `resize-none`: tingginya sudah mengikuti isi, dan pegangan resize
          // hanya menawarkan tinggi yang akan ditimpa ketikan berikutnya.
          className={`${fieldClass} resize-none overflow-hidden`}
        />
      ) : (
        <input
          ref={ref}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowToolbar(true)}
          className={fieldClass}
        />
      )}

      {(showToolbar || hasMath) && (
        <div className="flex flex-wrap items-center gap-1">
          {snippets.map((s) => (
            <button
              key={s.label}
              type="button"
              title={s.title}
              // Keep the caret in the field: without this the button steals focus
              // and the tutor's next keystroke lands nowhere.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(s.snippet)}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50"
            >
              {s.label}
            </button>
          ))}
          <span className="ml-1 text-xs text-gray-400">tulis rumus di antara tanda $</span>
        </div>
      )}

      {hasMath && (
        <div className="rounded border border-dashed border-gray-200 bg-white px-3 py-2 text-base">
          <span className="text-xs text-gray-400">Pratinjau:</span>
          {/* Multi-line fields hold one choice/answer per line, so preview them line by line. */}
          {value.split("\n").map((line, i) => (
            <div key={i} className="py-1 leading-loose">
              {line ? <MathText text={line} /> : " "}
            </div>
          ))}
        </div>
      )}

      {hint}
    </div>
  );
}
