/**
 * Berapa banyak sesi Tera yang belum punya soal asesmen — dijawab dari baris
 * commit, bukan dari layar.
 *
 * Ada karena pertanyaannya ("semua sesi sejak awal, bagaimana keadaannya?")
 * layak dijawab sebelum halaman `/dashboard/sesi` sempat dideploy, dan karena
 * angka totalnya menentukan apakah halaman itu perlu paginasi sungguhan.
 * Klasifikasinya dipakai bersama halaman tersebut (`src/lib/coverage.ts`)
 * supaya laporan ini dan layar tidak pernah bercerita beda.
 *
 * Butuh SUPABASE_SERVICE_ROLE_KEY karena berjalan tanpa sesi login: RLS akan
 * memulangkan nol baris untuk anon key. Kuncinya dibaca dari .env.local dan
 * tidak pernah dicetak.
 *
 * Jalankan: npm run check:coverage
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCoverage,
  COVERAGE_LABEL,
  type CoverageState,
  type RawAssessment,
  type RawQuiz,
  type RawSession,
} from "../src/lib/coverage";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.\n" +
      "Anon key tidak cukup: tanpa sesi login, RLS memulangkan nol baris dan laporannya akan\n" +
      "bilang semua sesi bolong.",
  );
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;

/** `skip` menyaring satu nilai kolom; cukup untuk satu-satunya saringan yang dipakai di sini. */
async function fetchAll<T>(
  table: string,
  columns: string,
  skip?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = db
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    const { data, error } = await (skip ? base.neq(skip.column, skip.value) : base);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

async function main() {
  const sessions = await fetchAll<RawSession>(
    "sessions",
    "id, scheduled_at, topic, status, classes(name)",
    { column: "status", value: "cancelled" },
  );
  const assessments = await fetchAll<RawAssessment>(
    "assessments",
    "id, session_id, quiz_id, title, share_code",
  );
  const quizzes = await fetchAll<RawQuiz>("quizzes", "id, status");
  const questions = await fetchAll<{ quiz_id: string }>("questions", "id, quiz_id");

  const questionCounts = new Map<string, number>();
  for (const q of questions) questionCounts.set(q.quiz_id, (questionCounts.get(q.quiz_id) ?? 0) + 1);

  const coverage = buildCoverage({ sessions, assessments, quizzes, questionCounts });

  const counts: Record<CoverageState, number> = { belum: 0, "luar-sora": 0, "belum-siap": 0, siap: 0 };
  for (const s of coverage) counts[s.state]++;

  console.log(`\n${coverage.length} sesi (di luar yang batal), sejak awal:\n`);
  for (const state of Object.keys(counts) as CoverageState[]) {
    const pct = coverage.length ? Math.round((counts[state] / coverage.length) * 100) : 0;
    console.log(`  ${String(counts[state]).padStart(5)}  ${COVERAGE_LABEL[state]} (${pct}%)`);
  }

  const teraOnly = coverage.filter((s) => s.state === "luar-sora");
  console.log(
    `\n${teraOnly.length} sesi punya asesmen yang BUKAN dibuat di Sora ` +
      `(baris assessments tanpa quiz_id — nilainya diketik manual di Tera).`,
  );

  const now = Date.now();
  const mendatang = coverage.filter(
    (s) => s.state !== "siap" && new Date(s.scheduledAt).getTime() >= now,
  );
  console.log(`${mendatang.length} di antara yang belum bersoal adalah sesi yang BELUM berlangsung.\n`);
  for (const s of mendatang.slice(0, 20)) {
    const when = new Date(s.scheduledAt).toISOString().slice(0, 16).replace("T", " ");
    console.log(`  ${when}  ${(s.className ?? "-").padEnd(20)} ${COVERAGE_LABEL[s.state]}  ${s.topic ?? ""}`);
  }
  if (mendatang.length > 20) console.log(`  … dan ${mendatang.length - 20} lagi.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
