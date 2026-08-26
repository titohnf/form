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
import { BRANCH_END, QUESTION_TYPE_LABEL } from "@/lib/types";
import { BLOOM_LEVELS } from "@/lib/bloom";
import { questionIssue } from "@/lib/question-validation";
import MathField from "@/lib/MathField";
import IsiSoalEditor from "./IsiSoalEditor";
import { createClient } from "@/lib/supabase/client";

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
  /** statement_grid — the three arrays/labels below stay aligned by index. */
  statements: string[];
  statementKeys: (boolean | null)[];
  statementLabels: [string, string];
  /** Judul kolom pernyataan; "" berarti sudut kiri atas dibiarkan kosong. */
  statementLabel: string;
  gradingMode: StatementGridGradingMode;
  branching: Branching;
  /** "" berarti belum ditetapkan; select HTML hanya mengenal string. */
  bloomLevel: string;
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
    statements: grid?.statements?.length ? grid.statements : ["", ""],
    statementKeys: Array.isArray(gridKey.answers) ? gridKey.answers : [],
    statementLabels: grid?.answer_labels ?? DEFAULT_STATEMENT_LABELS,
    statementLabel: grid?.statement_label ?? "",
    gradingMode: gridKey.grading_mode === "all_or_nothing" ? "all_or_nothing" : "proportional",
    branching: question.branching ?? {},
    bloomLevel: question.bloom_level ? String(question.bloom_level) : "",
  };
}

const IMAGE_BUCKET = "question-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Unggah gambar soal langsung dari editor ke Supabase Storage.
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
      statement_label: draft.statementLabel.trim() || undefined,
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
    bloom_level: draft.bloomLevel ? Number(draft.bloomLevel) : null,
  };
}

/**
 * Menu titik tiga di kepala kartu — untuk sekarang isinya cuma "Hapus soal".
 *
 * Hapus tidak lagi berdiri telanjang di sudut kartu. Ia tetangga langsung dari
 * tombol yang paling sering ditekan orang di layar ini, tidak bisa dibatalkan,
 * dan satu klik meleset menghapus soal yang mungkin dipakai beberapa paket.
 * Di balik satu ketukan tambahan, meleset jadi tidak berakibat apa-apa.
 *
 * Konfirmasinya di tempat, bukan `window.confirm`: dialog bawaan membekukan
 * seluruh halaman demi satu pertanyaan sebaris.
 */
function MenuKartu({ onDelete }: { onDelete: () => void }) {
  const [buka, setBuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setBuka(false);
        setKonfirmasi(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setBuka(false);
      setKonfirmasi(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [buka]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={buka}
        title="Tindakan lain"
        onClick={() => setBuka((t) => !t)}
        className={`rounded px-2 py-0.5 text-sm leading-none ${
          buka ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        }`}
      >
        ⋯
      </button>

      {buka && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        >
          {konfirmasi ? (
            <div className="flex flex-col gap-1 p-2">
              <p className="text-xs text-gray-600">Hapus soal ini? Tidak bisa dibatalkan.</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Ya, hapus
                </button>
                <button
                  type="button"
                  onClick={() => setKonfirmasi(false)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setKonfirmasi(true)}
              className="w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-red-50 hover:text-red-600"
            >
              Hapus soal
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  flushRef,
  dragHandleProps,
  branchingContext,
  tanpaBobot,
  tanpaPenandaSimpan,
  catatan,
  onPerubahan,
}: {
  question: Question;
  /** Heading for this card, e.g. "Soal 3". */
  label: string;
  save: (patch: QuestionPatch) => Promise<void>;
  onPromptChange?: (prompt: string) => void;
  onDelete?: () => void;
  onSaveToBank?: () => Promise<void>;
  /**
   * Diisi editor dengan cara menuliskan suntingan yang masih mengantre,
   * sekarang juga. Dipakai halaman draf dan kartu bank soal: tombol "Simpan"
   * di sana harus membawa ketikan terakhir, yang mungkin baru berumur
   * seperempat detik.
   */
  flushRef?: React.RefObject<(() => Promise<void>) | null>;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  /**
   * Menyembunyikan field Bobot. Diisi bank soal: bobot adalah berapa besar
   * andil soal ini terhadap nilai satu kuis, jadi ia baru punya arti setelah
   * soalnya masuk ke kuis — di bank, angka itu hanya field yang harus
   * dilewati setiap kali seseorang menyunting soal.
   */
  tanpaBobot?: boolean;
  /**
   * Menyembunyikan penanda "Menyimpan…/Tersimpan ✓". Diisi pemakai yang
   * memegang sendiri penyimpanannya — bank soal dan halaman draf — di mana
   * `save` cuma menaruh suntingan di ingatan halaman, dan penanda yang
   * mengatakan "Tersimpan" di sana adalah kabar bohong.
   */
  tanpaPenandaSimpan?: boolean;
  /**
   * Keterangan kecil di kepala kartu, sebaris dengan menu di ujung kanan.
   * Diisi bank soal dengan kapan soalnya terakhir disimpan — di sana penanda
   * autosave tidak ada, jadi itulah satu-satunya kabar tentang nasib
   * suntingannya.
   */
  catatan?: React.ReactNode;
  /**
   * Dipanggil tiap kali isi soal beranjak dari — atau kembali ke — keadaannya
   * saat editor dibuka. Yang tahu bedanya cuma editor ini, dan pemakainya yang
   * menyimpan sendiri butuh tahu: itulah yang membedakan "Belum disimpan" dari
   * "Terakhir disimpan". Kembali ke persis semula dihitung sebagai tidak ada
   * perubahan — orang yang mengetik lalu menghapusnya lagi memang tidak
   * mengubah apa-apa.
   */
  onPerubahan?: (adaPerubahan: boolean) => void;
  /** Omitted outside a quiz: branching targets only exist among sibling questions. */
  branchingContext?: {
    sequentialMode: boolean;
    otherQuestions: Pick<Question, "id" | "prompt">[];
  };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(question));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Isi soal saat editor ini dibuka, dibekukan sebagai teks untuk dibandingkan.
  //
  // Dulu di sini ada `skipFirstSave`: sebuah ref yang melewatkan jalannya efek
  // yang PERTAMA. Itu salah menghitung yang mau dihitung. React Strict Mode
  // memasang lalu melepas lalu memasang lagi tiap komponen, jadi jalan kedua
  // bukan lagi "pertama" — dan editor menuliskan soal yang tidak seorang pun
  // sentuh. Selama ada autosave, tulisan hantu itu tidak kelihatan (isinya
  // sama persis). Sejak bank soal berhenti autosave, ia muncul sebagai
  // "Belum disimpan" di kartu yang baru saja dibuka.
  //
  // Yang benar bukan "apakah ini jalan pertama", melainkan "apakah isinya
  // berbeda". Efek sampingnya menyenangkan: mengetik lalu menghapusnya lagi
  // sampai persis seperti semula berhenti dihitung sebagai perubahan.
  const awal = useRef<string | null>(null);
  if (awal.current === null) awal.current = JSON.stringify(toPatch(toDraft(question)));
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
  // Latest-ref, sama alasannya dengan `saveRef`: pemakainya kerap mengoper
  // fungsi anonim, dan tanpa ini tiap render mengulang jeda autosave.
  const perubahanRef = useRef(onPerubahan);
  useEffect(() => {
    perubahanRef.current = onPerubahan;
  });

  useEffect(() => {
    const patch = toPatch(draft);
    if (JSON.stringify(patch) === awal.current) {
      pending.current = null;
      setSaveState("idle");
      perubahanRef.current?.(false);
      return;
    }

    pending.current = patch;
    setSaveState("saving");
    perubahanRef.current?.(true);
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, flush]);

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, flush]);

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
      {/* Garis di bawah kepala kartu: label dan keterangan keadaan bicara
          tentang kartunya, sedangkan yang di bawah garis adalah isi soalnya. */}
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
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
        </span>
        {/* Keterangan keadaan — apa yang kurang, kapan terakhir disimpan —
            berkumpul di satu sisi. Dulu yang kurang berdiri di kiri menempel
            pada label sementara kapan tersimpannya di kanan, jadi dua kabar
            tentang hal yang sama harus dicari di dua tempat. */}
        <div className="flex items-center gap-3">
          {issue && (
            <span
              title="Soal ini menahan paket soal dari diterbitkan"
              className="text-xs text-amber-600"
            >
              {issue}
            </span>
          )}
          {!tanpaPenandaSimpan && (
            <span className="text-xs text-gray-400">
              {saveState === "saving" ? "Menyimpan…" : saveState === "saved" ? "Tersimpan ✓" : ""}
            </span>
          )}
          {onSaveToBank && (
            <button
              type="button"
              // Bank Soal menyalin baris yang tersimpan, jadi suntingan yang
              // tertunda harus mendarat dulu — kalau tidak, yang tersalin versi
              // sebelum ketikan terakhir.
              onClick={async () => {
                await flush();
                await onSaveToBank();
              }}
              className="text-xs text-gray-500 hover:underline"
            >
              Simpan ke Bank Soal
            </button>
          )}
          {catatan}
          {onDelete && <MenuKartu onDelete={onDelete} />}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Tipe Soal
            <select
              value={draft.type}
              onChange={(e) => patchDraft({ type: e.target.value as QuestionType })}
              className="rounded border border-gray-300 px-3 py-2"
            >
              {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Taksonomi Bloom
            <select
              value={draft.bloomLevel}
              onChange={(e) => patchDraft({ bloomLevel: e.target.value })}
              className="rounded border border-gray-300 px-3 py-2"
            >
              {/* Kosong tetap jadi pilihan yang sah, bukan cuma keadaan awal:
                  penulis soal belum tentu tahu levelnya saat menulis, dan
                  memaksanya menebak hanya menghasilkan label yang salah. */}
              <option value="">Belum ditetapkan</option>
              {BLOOM_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.code} — {level.label}
                </option>
              ))}
            </select>
          </label>
          {!tanpaBobot && (
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
          )}
        </div>

        {/* <div>, bukan <label>: isinya tumpukan blok dengan beberapa kotak
            teks di dalamnya, dan sebuah label hanya boleh menunjuk satu. */}
        <div className="flex flex-col gap-1 text-sm">
          <IsiSoalEditor
            label="Pertanyaan"
            value={draft.prompt}
            onChange={(prompt) => {
              patchDraft({ prompt });
              onPromptChange?.(prompt);
            }}
            unggahGambar={uploadImage}
            placeholder="Tulis pertanyaan"
          />
          {draft.type === "fill_blank" && (
            <span className="text-xs text-gray-400">
              Tandai bagian kosong dengan tiga garis bawah, contoh: Ibukota Indonesia adalah ___.
            </span>
          )}
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
          <div className="text-sm">
            Jawaban benar
            {/* Benar/Salah di sini jawabannya, jadi sebesar isi soal yang lain. */}
            <div className="mt-1 flex gap-4 text-base">
              {(["true", "false"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={draft.tfCorrect === v}
                    onChange={() => patchDraft({ tfCorrect: v })}
                    className="h-4 w-4"
                  />
                  {v === "true" ? "Benar" : "Salah"}
                </label>
              ))}
            </div>
          </div>
        )}

        {draft.type === "short_answer" && (
          <label className="flex flex-col gap-1 text-sm">
            Kunci jawaban (pisahkan dengan koma jika ada beberapa variasi)
            <MathField
              value={draft.shortAnswerKeys}
              onChange={(shortAnswerKeys) => patchDraft({ shortAnswerKeys })}
            />
          </label>
        )}

        {draft.type === "matching" && (
          <label className="flex flex-col gap-1 text-sm">
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
          <label className="flex flex-col gap-1 text-sm">
            Urutan yang benar (satu item per baris, dari atas ke bawah)
            <MathField
              value={draft.orderingItems}
              onChange={(orderingItems) => patchDraft({ orderingItems })}
              rows={4}
            />
          </label>
        )}

        {draft.type === "fill_blank" && (
          <label className="flex flex-col gap-1 text-sm">
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
            statementLabel={draft.statementLabel}
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

        {/* Editor blok yang sama dengan pertanyaan: pembahasan yang bagus kerap
            justru butuh tabel langkah atau gambar bantu, dan tidak ada alasan
            alat itu berhenti di batas pertanyaan. */}
        <div className="flex flex-col gap-1 text-sm">
          <IsiSoalEditor
            label="Pembahasan"
            value={draft.explanation}
            onChange={(explanation) => patchDraft({ explanation })}
            unggahGambar={uploadImage}
            placeholder="Kenapa jawabannya begitu"
          />
        </div>

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
  statementLabel,
  gradingMode,
  onChange,
}: {
  statements: string[];
  statementKeys: (boolean | null)[];
  statementLabels: [string, string];
  statementLabel: string;
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
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Pernyataan{" "}
        <span className="text-xs text-gray-400">
          — tandai kunci tiap baris; murid menjawab satu per satu
        </span>
      </p>

      {/* Bentuknya tabel, sama seperti yang dibaca di kartu bank soal dan sama
          seperti yang dikerjakan murid: pernyataan menurun, kategori melintang.
          Label kategorinya disunting di kepala kolomnya sendiri — dulu ia
          sepasang kotak "Label jawaban" yang berdiri jauh dari kolom yang
          dinamainya, dan kaitannya harus ditebak. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {/* Sudut kiri atas ikut bisa diisi. Boleh dibiarkan kosong —
                  judul tiap baris memang pernyataannya sendiri — tapi grid yang
                  kategorinya bukan Benar/Salah kerap perlu menyebut barisnya
                  berisi apa: "Peristiwa", "Pernyataan", "Zat". */}
              <th scope="col" className="w-1/2 border border-gray-200 px-3 py-3">
                <input
                  value={statementLabel}
                  onChange={(e) => onChange({ statementLabel: e.target.value })}
                  placeholder="Pernyataan (opsional)"
                  aria-label="Judul kolom pernyataan"
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-base font-normal"
                />
              </th>
              {([0, 1] as const).map((slot) => (
                <th key={slot} scope="col" className="border border-gray-200 px-3 py-3">
                  <input
                    value={statementLabels[slot]}
                    onChange={(e) => setLabel(slot, e.target.value)}
                    placeholder={slot === 0 ? "Benar" : "Salah"}
                    aria-label={`Label kategori ${slot + 1}`}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-base font-normal"
                  />
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {statements.map((statement, i) => (
              <tr key={i}>
                <th scope="row" className="border border-gray-200 p-2 font-normal align-top">
                  <MathField
                    value={statement}
                    onChange={(text) => setStatementAt(i, text)}
                    placeholder={`Pernyataan ${i + 1}`}
                  />
                </th>
                {([true, false] as const).map((key) => (
                  <td
                    key={String(key)}
                    className="border border-gray-200 px-3 py-3 text-center align-top"
                  >
                    <input
                      type="radio"
                      name={`statement_${i}`}
                      checked={statementKeys[i] === key}
                      disabled={!statement.trim()}
                      onChange={() => setKeyAt(i, key)}
                      // Barisnya masih kosong: menandai kunci untuk pernyataan
                      // yang belum ditulis tidak berarti apa-apa.
                      title={statement.trim() ? undefined : "Tulis pernyataannya dulu"}
                      aria-label={statementLabels[key ? 0 : 1] || (key ? "Benar" : "Salah")}
                      className="mt-[13px] h-4 w-4 disabled:opacity-30"
                    />
                  </td>
                ))}
                <td className="align-top">
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    disabled={statements.length <= 1}
                    title="Hapus pernyataan"
                    className="mt-2 px-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    // Tanpa kotak dan tanpa latar sendiri: pilihan jawaban bukan sisipan di
    // tengah soal, ia bagian soal yang sama pentingnya dengan pertanyaannya —
    // dan satu-satunya yang dibedakan warna di layar ini seharusnya yang
    // memang beda, bukan yang paling sering dibaca.
    <div className="flex flex-col gap-3 text-sm">
      <p>Pilihan jawaban</p>

      {choices.map((choice, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            type={multi ? "checkbox" : "radio"}
            checked={multi ? correctChoices.includes(choice) : correctChoice === choice}
            disabled={!choice.trim()}
            onChange={() => toggleCorrect(choice)}
            title={choice.trim() ? "Tandai sebagai jawaban benar" : "Isi pilihan ini dulu"}
            // Baris pertama teks di dalam kolom mulai 9px dari atas (garis +
            // padding) dan tingginya 24px, jadi pusatnya 21px; kotak 16px
            // ditaruh 13px di bawah puncak baris supaya keduanya sepusat.
            className="mt-[13px] h-4 w-4 disabled:opacity-30"
          />
          <div className="flex-1">
            {/* Editor blok yang sama dengan pertanyaan: pilihan jawaban TKA
                kerap berupa gambar atau potongan tabel, dan pilihan yang cuma
                bisa berupa teks memaksa soalnya ditulis ulang jadi soal lain. */}
            <IsiSoalEditor
              value={choice}
              onChange={(text) => setChoiceAt(i, text)}
              unggahGambar={uploadImage}
              placeholder={`Pilihan ${i + 1}`}
              tombolSamar
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
