import { evaluate } from "./expr";
import type { McqOptions, Question, QuestionOptions } from "./types";

/**
 * Soal berparameter: satu soal yang bisa melahirkan varian angka.
 *
 * Dipakai untuk remedial — mengulang soal yang persis sama mengundang murid
 * menghafal jawabannya alih-alih memahaminya.
 *
 * Angkanya dibangkitkan **saat penyalinan**, bukan saat murid menjawab. Soal
 * remedial yang lahir adalah soal biasa dengan angka dan kunci yang sudah jadi,
 * jadi penilaian, halaman hasil, dan latihan mandiri tidak perlu tahu apa pun
 * tentang templat ini. Kalau angkanya dibangkitkan saat menjawab, seluruh jalur
 * itu harus ikut berubah dan tiap murid mengerjakan soal yang berbeda — jauh
 * lebih mahal, dan menyulitkan tutor membahas hasilnya di kelas.
 */
export interface QuestionTemplate {
  /**
   * Teks pertanyaan bertemplat, memuat `{{rumus}}`.
   *
   * Hidup di sini, bukan di `questions.prompt`, karena `prompt` adalah yang
   * dibaca murid — dan murid tidak boleh melihat `{{a * b}}`. Soalnya sendiri
   * selalu berupa varian konkret; templat ini yang melahirkannya, baik saat
   * penulisnya menekan "Terapkan varian" maupun saat soal disalin ke remedial.
   */
  prompt: string;
  /** Nilai acak yang boleh dipakai di `{{...}}` pada pertanyaan dan di rumus. */
  params: { name: string; min: number; max: number; step?: number }[];
  /** Rumus yang harus bernilai benar; varian yang gagal dibuang lalu diundi ulang. */
  constraints: string[];
  /** Rumus kunci jawaban. */
  answer: string;
  /**
   * Rumus tiap pengecoh, urut sesuai pilihan aslinya.
   *
   * Pengecoh bukan angka acak — di soal yang baik tiap pilihan salah adalah
   * hasil satu kekeliruan tertentu. Karena itu rumusnya ditulis tangan, bukan
   * dibangkitkan: kalau diacak, soalnya berhenti mendiagnosis apa pun.
   */
  distractors: string[];
  /** Format angka saat disisipkan, mis. "Rp{a}" ditulis sebagai ribuan. */
  thousands?: boolean;
}

export interface GeneratedVariant {
  prompt: string;
  options: QuestionOptions;
  correct_answer: unknown;
}

const MAX_DRAWS = 200;

function randomInt(min: number, max: number, step: number): number {
  const steps = Math.floor((max - min) / step);
  return min + step * Math.floor(Math.random() * (steps + 1));
}

function formatNumber(value: number, thousands: boolean): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return thousands ? rounded.toLocaleString("id-ID") : String(rounded);
}

/**
 * Menghitung tiap `{{...}}` di teks dan menggantinya dengan hasilnya.
 *
 * Isinya rumus penuh, bukan sekadar nama parameter — soal tali butuh panjang
 * `{{d * p}}` cm, bukan "d*p" yang harus dikalikan sendiri oleh pembacanya.
 *
 * Kurawal ganda, bukan tunggal, karena pertanyaan boleh memuat LaTeX dan
 * `\frac{1}{2}` akan tertangkap oleh pola kurawal tunggal.
 */
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

function fill(text: string, scope: Record<string, number>, thousands: boolean): string {
  return text.replace(PLACEHOLDER, (_whole, formula: string) =>
    formatNumber(evaluate(formula, scope), thousands),
  );
}

/**
 * Memeriksa templat tanpa mengubah apa pun, untuk pratinjau di editor.
 * Mengembalikan pesan kesalahan pertama, atau null kalau sehat.
 */
export function templateIssue(template: QuestionTemplate): string | null {
  if (!template.prompt?.trim()) return "Pertanyaan bertemplat masih kosong.";
  if (template.params.length === 0) return "Belum ada parameter.";

  for (const param of template.params) {
    if (!/^[a-zA-Z_]\w*$/.test(param.name)) return `Nama parameter tidak sah: ${param.name}`;
    if (!(param.min <= param.max)) return `Rentang ${param.name} terbalik.`;
    if (param.step !== undefined && param.step <= 0) return `Langkah ${param.name} harus positif.`;
  }

  if (!PLACEHOLDER.test(template.prompt)) {
    PLACEHOLDER.lastIndex = 0;
    return "Pertanyaan bertemplat tidak memuat satu pun {{rumus}}, jadi variannya akan sama semua.";
  }
  PLACEHOLDER.lastIndex = 0;

  try {
    generate(template, null);
  } catch (error) {
    return error instanceof Error ? error.message : "Templat gagal dijalankan.";
  }
  return null;
}

/**
 * Melahirkan satu varian. `options` dipakai untuk mengetahui berapa pilihan yang
 * harus dihasilkan; null berarti sekadar uji coba di editor.
 */
export function generate(template: QuestionTemplate, options: QuestionOptions): GeneratedVariant {
  const thousands = template.thousands ?? false;

  for (let draw = 0; draw < MAX_DRAWS; draw += 1) {
    const scope: Record<string, number> = {};
    for (const param of template.params) {
      scope[param.name] = randomInt(param.min, param.max, param.step ?? 1);
    }

    // Syaratnya diperiksa dulu supaya rumus jawaban tidak pernah dipanggil
    // dengan angka yang memang tidak masuk akal (pembagian nol, FPB 1, dst).
    if (!template.constraints.every((rule) => evaluate(rule, scope) !== 0)) continue;

    const answer = evaluate(template.answer, scope);
    const distractors = template.distractors.map((rule) => evaluate(rule, scope));

    // Pengecoh yang kebetulan bertabrakan dengan kunci membuat soal punya dua
    // jawaban benar. Undi ulang, jangan diperbaiki diam-diam.
    const values = [answer, ...distractors];
    if (new Set(values.map((v) => formatNumber(v, thousands))).size !== values.length) continue;

    const correct = formatNumber(answer, thousands);
    const choices = values.map((value) => formatNumber(value, thousands));

    return {
      prompt: fill(template.prompt, scope, thousands),
      options: isMcq(options) ? { ...options, choices } : ({ choices } as McqOptions),
      correct_answer: correct,
    };
  }

  throw new Error(
    `Tidak ada kombinasi angka yang memenuhi syarat setelah ${MAX_DRAWS} undian. Longgarkan rentang atau syaratnya.`,
  );
}

function isMcq(options: QuestionOptions): options is McqOptions {
  return !!options && typeof options === "object" && "choices" in options;
}

/**
 * Varian soal untuk disalin ke paket remedial. Soal tanpa templat disalin apa
 * adanya — sebagian besar soal memang tidak punya angka untuk diganti, dan
 * mengulanginya utuh tetap lebih berguna daripada tidak diremedialkan.
 */
export function variantOf(question: Question): Pick<Question, "prompt" | "options" | "correct_answer"> {
  const template = question.template;
  if (!template) {
    return {
      prompt: question.prompt,
      options: question.options,
      correct_answer: question.correct_answer,
    };
  }

  try {
    return generate(template, question.options);
  } catch {
    // Templat rusak tidak boleh menggagalkan pembuatan remedial: soal aslinya
    // masih jauh lebih berguna daripada paket yang tidak jadi.
    return {
      prompt: question.prompt,
      options: question.options,
      correct_answer: question.correct_answer,
    };
  }
}
