import type { Question, StatementGridOptions } from "@/lib/types";

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
