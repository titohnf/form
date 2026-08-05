"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Branching,
  MatchingOptions,
  McqOptions,
  OrderingOptions,
  Question,
  QuestionOptions,
  QuestionPatch,
  QuestionType,
  StatementGridAnswer,
  StatementGridGradingMode,
  StatementGridOptions,
} from "@/lib/types";
import { BRANCH_END } from "@/lib/types";
import { questionIssue } from "@/lib/question-validation";
import MathField from "@/lib/MathField";
import { createClient } from "@/lib/supabase/client";

const typeLabel: Record<QuestionType, string> = {
  mcq_single: "Pilihan Ganda (satu jawaban)",
  mcq_multi: "Pilihan Ganda (banyak jawaban / checkbox)",
  true_false: "Benar / Salah",
  short_answer: "Isian Singkat",
  essay: "Esai",
  matching: "Menjodohkan",
  ordering: "Mengurutkan",
  fill_blank: "Mengisi Bagian Kosong",
  upload_file: "Upload Gambar/File",
  statement_grid: "Grid Pernyataan (tiap baris Benar/Salah)",
};

const DEFAULT_STATEMENT_LABELS: [string, string] = ["Benar", "Salah"];

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved";

/** Everything the tutor can edit, kept in one object so autosave has a single dependency. */
interface Draft {
  type: QuestionType;
  prompt: string;
  weight: number;
  choices: string[];
  /** mcq_single */
  correctChoice: string;
  /** mcq_multi */
  correctChoices: string[];
  tfCorrect: "true" | "false";
  shortAnswerKeys: string;
  matchingPairs: string;
  orderingItems: string;
  fillBlankAnswers: string;
  explanation: string;
  /** Satu URL gambar stimulus per baris, mengikuti gaya field daftar lain di sini. */
  stimulusImages: string;
  /** statement_grid — the three arrays/labels below stay aligned by index. */
  statements: string[];
  statementKeys: (boolean | null)[];
  statementLabels: [string, string];
  gradingMode: StatementGridGradingMode;
  branching: Branching;
}

function toDraft(question: Question): Draft {
  const mcq = question.options as McqOptions | null;
  const matching = question.options as MatchingOptions | null;
  const ordering = question.options as OrderingOptions | null;
  const grid = question.options as StatementGridOptions | null;
  const gridKey = (question.correct_answer ?? {}) as Partial<StatementGridAnswer>;

  return {
    type: question.type,
    prompt: question.prompt,
    weight: Number(question.weight) || 1,
    choices: mcq?.choices?.length ? mcq.choices : ["", ""],
    correctChoice: typeof question.correct_answer === "string" ? question.correct_answer : "",
    correctChoices: Array.isArray(question.correct_answer) ? question.correct_answer : [],
    tfCorrect: question.correct_answer === "false" ? "false" : "true",
    shortAnswerKeys: Array.isArray(question.correct_answer)
      ? question.correct_answer.join(", ")
      : "",
    matchingPairs: matching?.pairs?.map((p) => `${p.left} = ${p.right}`).join("\n") ?? "",
    orderingItems: ordering?.items?.join("\n") ?? "",
    fillBlankAnswers: Array.isArray(question.correct_answer)
      ? question.correct_answer.join("\n")
      : "",
    explanation: question.explanation ?? "",
    stimulusImages: (question.stimulus_images ?? []).join("\n"),
    statements: grid?.statements?.length ? grid.statements : ["", ""],
    statementKeys: Array.isArray(gridKey.answers) ? gridKey.answers : [],
    statementLabels: grid?.answer_labels ?? DEFAULT_STATEMENT_LABELS,
    gradingMode: gridKey.grading_mode === "all_or_nothing" ? "all_or_nothing" : "proportional",
    branching: question.branching ?? {},
  };
}

/** Satu URL per baris, dibersihkan dari baris kosong dan spasi. */
function splitUrls(text: string): string[] {
  return text
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
}

const IMAGE_BUCKET = "question-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Unggah gambar stimulus langsung dari editor ke Supabase Storage.
 *
 * Memakai sesi admin yang sedang login, bukan service key: policy bucket-nya
 * (`is_admin()`, migrasi 069) yang menentukan boleh atau tidak, jadi tidak ada
 * kredensial istimewa yang perlu sampai ke browser.
 *
 * Nama berkasnya diacak, bukan memakai nama asli. Dua tutor yang sama-sama
 * mengunggah "grafik.png" tidak boleh saling menimpa, dan `upsert` dimatikan
 * supaya tabrakan menjadi error, bukan penggantian diam-diam.
 */
async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} bukan berkas gambar`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} lebih dari 5 MB`);

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `unggah/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Gagal mengunggah ${file.name}: ${error.message}`);

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Tombol unggah gambar; menambahkan URL hasil unggahan ke daftar yang sudah ada. */
function StimulusUpload({ onUploaded }: { onUploaded: (urls: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Berurutan, bukan Promise.all: kalau berkas ketiga ditolak, dua yang
      // sudah berhasil tetap terpasang dan tutor tinggal mengulang sisanya.
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push(await uploadImage(file));
      onUploaded(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      setBusy(false);
      // Supaya memilih berkas yang sama dua kali tetap memicu onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
        className="text-xs file:mr-2 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-gray-50 disabled:opacity-50"
      />
      {busy && <p className="text-xs text-gray-500">Mengunggah…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Pratinjau gambar stimulus di dalam editor. Tanpa ini yang terlihat hanya
 * deretan URL, dan salah tempel baru ketahuan setelah soal dibuka murid.
 * Gambar yang gagal dimuat ditandai eksplisit — URL mati kelihatan sama saja
 * dengan gambar kosong kalau dibiarkan diam.
 */
function StimulusPreview({
  value,
  onRemove,
}: {
  value: string;
  onRemove: (url: string) => void;
}) {
  const [broken, setBroken] = useState<string[]>([]);
  const urls = splitUrls(value);
  if (urls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <div key={url} className="relative">
          {broken.includes(url) ? (
            <div className="flex h-24 w-32 items-center justify-center rounded border border-red-200 bg-red-50 px-2 text-center text-xs text-red-600">
              Gambar tidak bisa dimuat
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              onError={() => setBroken((prev) => [...prev, url])}
              className="h-24 w-32 rounded border border-gray-200 bg-white object-contain"
            />
          )}
          <button
            type="button"
            onClick={() => onRemove(url)}
            title="Hapus gambar ini"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full border border-gray-300 bg-white text-xs leading-none text-gray-500 hover:bg-red-50 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Maps the draft onto the columns a question actually stores. */
function toPatch(draft: Draft): QuestionPatch {
  let options: QuestionOptions = null;
  let correct_answer: unknown = null;

  if (draft.type === "mcq_single" || draft.type === "mcq_multi") {
    const choices = draft.choices.map((c) => c.trim()).filter(Boolean);
    options = { choices };
    correct_answer =
      draft.type === "mcq_single"
        ? draft.correctChoice
        : draft.correctChoices.filter((c) => choices.includes(c));
  } else if (draft.type === "true_false") {
    correct_answer = draft.tfCorrect;
  } else if (draft.type === "short_answer") {
    correct_answer = draft.shortAnswerKeys
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  } else if (draft.type === "matching") {
    options = {
      pairs: draft.matchingPairs
        .split("\n")
        .map((line) => line.split("="))
        .filter((parts) => parts.length === 2)
        .map(([left, right]) => ({ left: left.trim(), right: right.trim() }))
        .filter((p) => p.left && p.right),
    };
  } else if (draft.type === "ordering") {
    options = {
      items: draft.orderingItems
        .split("\n")
        .map((i) => i.trim())
        .filter(Boolean),
    };
  } else if (draft.type === "fill_blank") {
    correct_answer = draft.fillBlankAnswers
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
  } else if (draft.type === "statement_grid") {
    // Drop blank rows together with their keys, so statements[i] and answers[i]
    // still describe the same row once the empty ones are gone.
    const rows = draft.statements
      .map((text, i) => ({ text: text.trim(), key: draft.statementKeys[i] ?? null }))
      .filter((row) => row.text);

    options = {
      statements: rows.map((r) => r.text),
      answer_labels: draft.statementLabels,
    };
    correct_answer = {
      answers: rows.map((r) => r.key),
      grading_mode: draft.gradingMode,
    } satisfies StatementGridAnswer;
  }
  // essay / upload_file keep both null.

  const branching = Object.fromEntries(Object.entries(draft.branching).filter(([, v]) => v));

  return {
    type: draft.type,
    prompt: draft.prompt,
    weight: draft.weight,
    options,
    correct_answer,
    explanation: draft.explanation.trim() || null,
    branching: Object.keys(branching).length > 0 ? branching : null,
    stimulus_images: splitUrls(draft.stimulusImages),
  };
}

/**
 * The question builder, used both for a question inside a quiz and for a
 * standalone item in the question bank. Everything specific to living in a quiz
 * — ordering, deletion, branching, "save to bank" — is optional, so the bank
 * gets the same editor without a second implementation.
 */
export default function QuestionEditor({
  question,
  label,
  save,
  onPromptChange,
  onDelete,
  onSaveToBank,
  dragHandleProps,
  branchingContext,
}: {
  question: Question;
  /** Heading for this card, e.g. "Soal 3". */
  label: string;
  save: (patch: QuestionPatch) => Promise<void>;
  onPromptChange?: (prompt: string) => void;
  onDelete?: () => void;
  onSaveToBank?: () => Promise<void>;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  /** Omitted outside a quiz: branching targets only exist among sibling questions. */
  branchingContext?: {
    sequentialMode: boolean;
    otherQuestions: Pick<Question, "id" | "prompt">[];
  };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(question));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const skipFirstSave = useRef(true);
  /** The edit the debounce has not written yet, or null when we are in sync. */
  const pending = useRef<ReturnType<typeof toPatch> | null>(null);
  const wasReady = useRef(questionIssue(question) === null);
  // Latest-ref so `flush` stays stable even when the parent passes an inline
  // arrow for `save`; without it every render would reset the debounce timer and
  // the unmount-flush cleanup would write on every keystroke.
  const saveRef = useRef(save);
  // Updated after each render rather than during it; the debounce means flush
  // never reads it before this has run.
  useEffect(() => {
    saveRef.current = save;
  });

  const issue = questionIssue({ ...question, ...toPatch(draft) });

  function patchDraft(changes: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  /** Writes the outstanding edit immediately. No-op when nothing is pending. */
  const flush = useCallback(async () => {
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    await saveRef.current(patch);
    setSaveState("saved");

    // The publish button is server-rendered, so refresh it when this question
    // crosses the line between incomplete and ready — but only then, otherwise
    // every burst of typing would re-render the page for nothing.
    const ready = questionIssue(patch) === null;
    if (ready !== wasReady.current) {
      wasReady.current = ready;
      router.refresh();
    }
  }, [router]);

  // Debounced autosave. Every edit resets the timer, so a burst of typing is
  // one write; the cleanup cancels the pending write if the tutor keeps going.
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }

    pending.current = toPatch(draft);
    setSaveState("saving");
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, flush]);

  // The debounce leaves a window where the last keystroke is not saved yet, so
  // also flush when the tutor leaves: unmount covers in-app navigation, and
  // `visibilitychange` is the last point a closing tab can still reach the
  // server (a `beforeunload` request is usually killed before it lands).
  useEffect(() => {
    function flushOnHide() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      flush();
    };
  }, [flush]);

  const branchChoices = !branchingContext?.sequentialMode
    ? []
    : draft.type === "true_false"
      ? ["true", "false"]
      : draft.type === "mcq_single"
        ? draft.choices.filter(Boolean)
        : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-gray-400">
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              title="Seret untuk mengubah urutan"
              className="cursor-grab select-none px-1 text-base text-gray-300 hover:text-gray-500 active:cursor-grabbing"
            >
              ⠿
            </span>
          )}
          {label}
          {issue && (
            <span
              title="Soal ini menahan paket soal dari diterbitkan"
              className="font-normal text-amber-600"
            >
              — {issue}
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {saveState === "saving" ? "Menyimpan…" : saveState === "saved" ? "Tersimpan ✓" : ""}
          </span>
          {onSaveToBank && (
            <button
              type="button"
              // The bank copies the stored row, so the pending edit has to land
              // first or it gets the version from before the last keystroke.
              onClick={async () => {
                await flush();
                await onSaveToBank();
              }}
              className="text-xs text-gray-500 hover:underline"
            >
              Simpan ke Bank
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-red-500 hover:underline"
            >
              Hapus
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Pertanyaan
          <MathField
            value={draft.prompt}
            onChange={(prompt) => {
              patchDraft({ prompt });
              onPromptChange?.(prompt);
            }}
            rows={2}
            placeholder="Tulis pertanyaan"
            hint={
              draft.type === "fill_blank" ? (
                <span className="text-xs text-gray-400">
                  Tandai bagian kosong dengan tiga garis bawah, contoh: Ibukota Indonesia adalah ___.
                </span>
              ) : undefined
            }
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Tipe Soal
            <select
              value={draft.type}
              onChange={(e) => patchDraft({ type: e.target.value as QuestionType })}
              className="rounded border border-gray-300 px-3 py-2"
            >
              {Object.entries(typeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-24 flex-col gap-1 text-sm">
            Bobot
            <input
              type="number"
              min={1}
              step={1}
              value={draft.weight}
              onChange={(e) => patchDraft({ weight: Number(e.target.value) || 1 })}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        {(draft.type === "mcq_single" || draft.type === "mcq_multi") && (
          <ChoiceRows
            multi={draft.type === "mcq_multi"}
            choices={draft.choices}
            correctChoice={draft.correctChoice}
            correctChoices={draft.correctChoices}
            onChange={patchDraft}
          />
        )}

        {draft.type === "true_false" && (
          <div className="rounded bg-gray-50 p-3 text-sm">
            Jawaban benar
            <div className="mt-1 flex gap-4">
              {(["true", "false"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={draft.tfCorrect === v}
                    onChange={() => patchDraft({ tfCorrect: v })}
                  />
                  {v === "true" ? "Benar" : "Salah"}
                </label>
              ))}
            </div>
          </div>
        )}

        {draft.type === "short_answer" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Kunci jawaban (pisahkan dengan koma jika ada beberapa variasi)
            <MathField
              value={draft.shortAnswerKeys}
              onChange={(shortAnswerKeys) => patchDraft({ shortAnswerKeys })}
            />
          </label>
        )}

        {draft.type === "matching" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Pasangan (format: Kiri = Kanan, satu per baris)
            <MathField
              value={draft.matchingPairs}
              onChange={(matchingPairs) => patchDraft({ matchingPairs })}
              rows={4}
              placeholder={"Ibukota Indonesia = Jakarta\nIbukota Malaysia = Kuala Lumpur"}
            />
          </label>
        )}

        {draft.type === "ordering" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Urutan yang benar (satu item per baris, dari atas ke bawah)
            <MathField
              value={draft.orderingItems}
              onChange={(orderingItems) => patchDraft({ orderingItems })}
              rows={4}
            />
          </label>
        )}

        {draft.type === "fill_blank" && (
          <label className="flex flex-col gap-1 rounded bg-gray-50 p-3 text-sm">
            Jawaban tiap bagian kosong (satu per baris, urut sesuai posisi ___ di pertanyaan)
            <MathField
              value={draft.fillBlankAnswers}
              onChange={(fillBlankAnswers) => patchDraft({ fillBlankAnswers })}
              rows={3}
            />
          </label>
        )}

        {draft.type === "statement_grid" && (
          <StatementRows
            statements={draft.statements}
            statementKeys={draft.statementKeys}
            statementLabels={draft.statementLabels}
            gradingMode={draft.gradingMode}
            onChange={patchDraft}
          />
        )}

        {draft.type === "essay" && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">
            Esai dinilai manual oleh tutor setelah murid submit.
          </p>
        )}

        {draft.type === "upload_file" && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">
            Murid mengunggah gambar/file sebagai jawaban; dinilai manual oleh tutor.
          </p>
        )}

        <div className="flex flex-col gap-1 text-sm">
          <label className="flex flex-col gap-1">
            Gambar soal{" "}
            <span className="text-xs text-gray-400">
              — opsional; satu URL per baris, ditampilkan di atas pertanyaan. Rumus jangan dipasang
              sebagai gambar — tulis sebagai LaTeX di pertanyaan supaya bisa dicari dan diperbesar.
            </span>
            <textarea
              value={draft.stimulusImages}
              onChange={(e) => patchDraft({ stimulusImages: e.target.value })}
              rows={2}
              placeholder="https://…/gambar.png"
              className="rounded border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </label>
          <StimulusUpload
            onUploaded={(urls) =>
              patchDraft({
                stimulusImages: [...splitUrls(draft.stimulusImages), ...urls].join("\n"),
              })
            }
          />
          <StimulusPreview
            value={draft.stimulusImages}
            onRemove={(url) =>
              patchDraft({
                stimulusImages: splitUrls(draft.stimulusImages)
                  .filter((u) => u !== url)
                  .join("\n"),
              })
            }
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Pembahasan{" "}
          <span className="text-xs text-gray-400">
            — opsional; ditampilkan ke murid setelah menjawab di mode latihan mandiri
          </span>
          <MathField
            value={draft.explanation}
            onChange={(explanation) => patchDraft({ explanation })}
            rows={2}
            placeholder="Kenapa jawabannya begitu"
          />
        </label>

        {branchChoices.length > 0 && (
          <div className="flex flex-col gap-2 rounded bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-900">Percabangan (mode satu soal per halaman)</p>
            {branchChoices.map((choice) => (
              <label key={choice} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate">
                  {choice === "true" ? "Benar" : choice === "false" ? "Salah" : choice}
                </span>
                <select
                  value={draft.branching[choice] ?? ""}
                  onChange={(e) =>
                    patchDraft({ branching: { ...draft.branching, [choice]: e.target.value } })
                  }
                  className="flex-1 rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">Lanjut otomatis (soal berikutnya)</option>
                  <option value={BRANCH_END}>Selesaikan paket soal</option>
                  {(branchingContext?.otherQuestions ?? [])
                    .filter((q) => q.id !== question.id)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        → {q.prompt.slice(0, 50) || "(soal tanpa judul)"}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One row per statement, each with its own two-way key. The answer labels are
 * editable because the pattern is not only Benar/Salah — Fakta/Opini or
 * Sesuai/Tidak Sesuai use the identical structure.
 */
function StatementRows({
  statements,
  statementKeys,
  statementLabels,
  gradingMode,
  onChange,
}: {
  statements: string[];
  statementKeys: (boolean | null)[];
  statementLabels: [string, string];
  gradingMode: StatementGridGradingMode;
  onChange: (changes: Partial<Draft>) => void;
}) {
  function setStatementAt(i: number, text: string) {
    onChange({ statements: statements.map((s, j) => (j === i ? text : s)) });
  }

  function setKeyAt(i: number, key: boolean) {
    const next = statements.map((_, j) => statementKeys[j] ?? null);
    next[i] = key;
    onChange({ statementKeys: next });
  }

  function removeAt(i: number) {
    onChange({
      statements: statements.filter((_, j) => j !== i),
      statementKeys: statements.map((_, j) => statementKeys[j] ?? null).filter((_, j) => j !== i),
    });
  }

  function setLabel(slot: 0 | 1, text: string) {
    const next: [string, string] = [...statementLabels];
    next[slot] = text;
    onChange({ statementLabels: next });
  }

  return (
    <div className="flex flex-col gap-2 rounded bg-gray-50 p-3">
      <p className="text-sm">
        Pernyataan{" "}
        <span className="text-xs text-gray-400">
          — tandai kunci tiap baris; murid menjawab satu per satu
        </span>
      </p>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        Label jawaban:
        <input
          value={statementLabels[0]}
          onChange={(e) => setLabel(0, e.target.value)}
          className="w-24 rounded border border-gray-300 px-2 py-1"
        />
        <input
          value={statementLabels[1]}
          onChange={(e) => setLabel(1, e.target.value)}
          className="w-24 rounded border border-gray-300 px-2 py-1"
        />
      </div>

      {statements.map((statement, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="mt-2 flex shrink-0 gap-2 text-xs">
            {([true, false] as const).map((key) => (
              <label key={String(key)} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`statement_${i}`}
                  checked={statementKeys[i] === key}
                  disabled={!statement.trim()}
                  onChange={() => setKeyAt(i, key)}
                  className="disabled:opacity-30"
                />
                {statementLabels[key ? 0 : 1] || (key ? "Benar" : "Salah")}
              </label>
            ))}
          </div>
          <div className="flex-1">
            <MathField
              value={statement}
              onChange={(text) => setStatementAt(i, text)}
              placeholder={`Pernyataan ${i + 1}`}
            />
          </div>
          <button
            type="button"
            onClick={() => removeAt(i)}
            disabled={statements.length <= 1}
            title="Hapus pernyataan"
            className="mt-2 px-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange({
            statements: [...statements, ""],
            statementKeys: [...statements.map((_, j) => statementKeys[j] ?? null), null],
          })
        }
        className="self-start text-sm text-gray-500 hover:underline"
      >
        + Tambah pernyataan
      </button>

      <label className="mt-1 flex items-center gap-2 border-t border-gray-200 pt-2 text-xs text-gray-500">
        Penilaian
        <select
          value={gradingMode}
          onChange={(e) => onChange({ gradingMode: e.target.value as StatementGridGradingMode })}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="proportional">Proporsional — nilai sebagian per baris yang benar</option>
          <option value="all_or_nothing">Semua atau tidak sama sekali</option>
        </select>
      </label>
    </div>
  );
}

/**
 * One row per answer choice, with the radio/checkbox that marks the key sitting
 * next to the text — so the correct answer is picked, never retyped.
 */
function ChoiceRows({
  multi,
  choices,
  correctChoice,
  correctChoices,
  onChange,
}: {
  multi: boolean;
  choices: string[];
  correctChoice: string;
  correctChoices: string[];
  onChange: (changes: Partial<Draft>) => void;
}) {
  function setChoiceAt(i: number, text: string) {
    const next = choices.map((c, j) => (j === i ? text : c));
    const changes: Partial<Draft> = { choices: next };

    // Keep the key pointing at the same row while its text is being edited.
    if (multi) {
      changes.correctChoices = correctChoices.map((c) => (c === choices[i] ? text : c));
    } else if (correctChoice === choices[i]) {
      changes.correctChoice = text;
    }

    onChange(changes);
  }

  function removeChoiceAt(i: number) {
    const removed = choices[i];
    onChange({
      choices: choices.filter((_, j) => j !== i),
      ...(multi
        ? { correctChoices: correctChoices.filter((c) => c !== removed) }
        : correctChoice === removed
          ? { correctChoice: "" }
          : {}),
    });
  }

  function toggleCorrect(text: string) {
    if (multi) {
      onChange({
        correctChoices: correctChoices.includes(text)
          ? correctChoices.filter((c) => c !== text)
          : [...correctChoices, text],
      });
    } else {
      onChange({ correctChoice: text });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded bg-gray-50 p-3">
      <p className="text-sm">
        Pilihan jawaban{" "}
        <span className="text-xs text-gray-400">
          — {multi ? "centang semua yang benar" : "klik lingkaran di kiri untuk menandai kunci"}
        </span>
      </p>

      {choices.map((choice, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            type={multi ? "checkbox" : "radio"}
            checked={multi ? correctChoices.includes(choice) : correctChoice === choice}
            disabled={!choice.trim()}
            onChange={() => toggleCorrect(choice)}
            title={choice.trim() ? "Tandai sebagai jawaban benar" : "Isi pilihan ini dulu"}
            className="mt-3 disabled:opacity-30"
          />
          <div className="flex-1">
            <MathField
              value={choice}
              onChange={(text) => setChoiceAt(i, text)}
              placeholder={`Pilihan ${i + 1}`}
            />
          </div>
          <button
            type="button"
            onClick={() => removeChoiceAt(i)}
            disabled={choices.length <= 1}
            title="Hapus pilihan"
            className="mt-2 px-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange({ choices: [...choices, ""] })}
        className="self-start text-sm text-gray-500 hover:underline"
      >
        + Tambah pilihan
      </button>
    </div>
  );
}
