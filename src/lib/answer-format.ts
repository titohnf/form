import type { Question, StatementGridOptions } from "@/lib/types";
import { ringkasIsiSoal } from "@/lib/isi-soal";

/**
 * Renders a stored response as text for the tutor-facing screens (hasil, live
 * monitoring). The output is still passed through <MathText>, so LaTeX written
 * inside a statement or choice survives the trip.
 *
 * Without this the screens fell back to `String(response)`, which is fine for
 * the single-value types but turns a matching answer into "[object Object]" and
 * a statement grid into "true,false,true".
 */
export function formatResponse(
  question: Pick<Question, "type" | "options">,
  response: unknown,
): string {
  if (response === null || response === undefined || response === "") return "-";

  switch (question.type) {
    case "statement_grid": {
      const options = question.options as StatementGridOptions | null;
      const [trueLabel, falseLabel] = options?.answer_labels ?? ["Benar", "Salah"];
      const answers = Array.isArray(response) ? (response as unknown[]) : [];
      // Numbered by position rather than repeating each statement, which would
      // bury the answer in a wall of text on the live feed.
      return (options?.statements ?? [])
        .map((_, i) => {
          const answer = answers[i];
          const label = answer === true ? trueLabel : answer === false ? falseLabel : "—";
          return `${i + 1}. ${label}`;
        })
        .join("   ");
    }

    case "true_false_two_tier": {
      const jawab = (response ?? {}) as { tier1?: unknown; tier2?: unknown };
      // Tingkat 1 dikirim sebagai teks "true"/"false"; boolean masih diterima
      // supaya jawaban lama tidak berubah jadi "—" di layar hasil.
      const t1 = jawab.tier1;
      const tingkat1 =
        t1 === "true" || t1 === true ? "Benar" : t1 === "false" || t1 === false ? "Salah" : "—";
      // Alasannya memang sudah berupa teks, bukan nomor: nomor alasan tidak
      // berarti apa-apa bagi tutor yang sedang membaca layar hasil.
      const alasan = typeof jawab.tier2 === "string" ? jawab.tier2.trim() : "";
      return `${tingkat1} — ${alasan || "alasan belum dipilih"}`;
    }

    case "matching": {
      const submitted = response as Record<string, string>;
      return Object.entries(submitted)
        .map(([left, right]) => `${left} = ${right}`)
        .join("; ");
    }

    default:
      if (Array.isArray(response)) {
        return response.map((v) => (v === null || v === "" ? "—" : String(v))).join(", ");
      }
      if (typeof response === "object") return JSON.stringify(response);
      return String(response);
  }
}

/**
 * Jawaban murid untuk layar tutor yang cuma punya satu baris — live monitoring,
 * daftar koreksi. Sejak pilihan jawaban boleh berupa gambar atau tabel, jawaban
 * yang tersimpan bisa berupa penanda `[gambar: …]` sepanjang satu baris penuh;
 * di sini ia diringkas, dan pilihan yang isinya cuma gambar disebut apa adanya
 * ketimbang tampil sebagai baris kosong.
 */
export function jawabanRingkas(
  question: Pick<Question, "type" | "options">,
  response: unknown,
): string {
  const penuh = formatResponse(question, response);
  return ringkasIsiSoal(penuh) || (penuh.includes("[gambar:") ? "(pilihan bergambar)" : penuh);
}
