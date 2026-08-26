/**
 * Cakupan soal per sesi: sesi mana di Tera yang belum punya soal asesmen.
 *
 * Arahnya sengaja kebalikan dari editor. Di `quizzes/[id]/edit` pertanyaannya
 * "paket ini dipakai di sesi mana", jadi sesi yang tidak pernah dipilih siapa
 * pun tidak muncul di mana-mana. Di sini pertanyaannya dibalik — "sesi ini
 * punya soal atau tidak" — dan itu satu-satunya cara sesi yang terlewat bisa
 * kelihatan.
 *
 * Klasifikasinya murni supaya bisa diuji tanpa Supabase; pengambilan datanya
 * ada di `dashboard/sesi/page.tsx`.
 */

/**
 * Asal satu baris `assessments`.
 *
 * Tidak perlu kolom baru di Tera untuk menandainya: sejak migrasi 071 setiap
 * asesmen yang lahir dari Sora membawa `quiz_id`, dan asesmen yang diketik
 * manual di Tera tidak pernah punya. `quiz_id is null` ADALAH flag-nya, dan
 * flag turunan tidak bisa jadi basi seperti kolom yang harus diisi sendiri.
 */
export type AssessmentOrigin = "sora" | "tera";

export type CoverageState = "belum" | "luar-sora" | "belum-siap" | "siap";

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  belum: "Belum ada asesmen",
  "luar-sora": "Asesmen dari Tera",
  "belum-siap": "Soal belum siap",
  siap: "Sudah bersoal",
};

export const COVERAGE_HINT: Record<CoverageState, string> = {
  belum: "Sesi ini tidak punya baris asesmen sama sekali — murid tidak akan menerima soal apa pun.",
  "luar-sora":
    "Asesmennya dibuat di Tera, bukan di Sora: nilainya diketik manual dan tidak ada soal yang bisa dikerjakan murid.",
  "belum-siap": "Soalnya sudah dibuat di Sora tapi masih draf atau belum berisi pertanyaan.",
  siap: "Ada paket soal terbit dengan minimal satu pertanyaan.",
};

export interface CoverageAssessment {
  id: string;
  title: string;
  shareCode: string | null;
  origin: AssessmentOrigin;
  quizId: string | null;
  /** Null kalau asesmennya dari Tera, atau kalau kuisnya tidak terbaca. */
  quizStatus: string | null;
  questionCount: number;
  /** Sudah ada nilai murid di sesi ini, jadi penugasannya tidak boleh ditarik. */
  graded: boolean;
}

export interface SessionCoverage {
  id: string;
  scheduledAt: string;
  topic: string | null;
  status: string;
  className: string | null;
  state: CoverageState;
  assessments: CoverageAssessment[];
}

/** Baris mentah yang dibaca dari Supabase, disebut di sini supaya query dan klasifikasi tidak menyimpang. */
export interface RawSession {
  id: string;
  scheduled_at: string;
  topic: string | null;
  status: string;
  classes: { name: string } | null;
}

export interface RawAssessment {
  id: string;
  session_id: string;
  quiz_id: string | null;
  title: string;
  share_code: string | null;
}

export interface RawQuiz {
  id: string;
  status: string;
}

/**
 * Sebuah asesmen dianggap benar-benar memberi soal hanya kalau paketnya sudah
 * terbit DAN berisi pertanyaan. Draf tidak bisa dibuka murid, dan paket kosong
 * membuka halaman tanpa soal — dua-duanya sama saja dengan tidak ada soal, jadi
 * keduanya tetap masuk daftar kerja.
 */
function isReady(a: CoverageAssessment): boolean {
  return a.origin === "sora" && a.quizStatus === "published" && a.questionCount > 0;
}

export function buildCoverage({
  sessions,
  assessments,
  quizzes,
  questionCounts,
  gradedAssessmentIds,
}: {
  sessions: RawSession[];
  assessments: RawAssessment[];
  quizzes: RawQuiz[];
  questionCounts: Map<string, number>;
  /** Opsional: tanpa ini tidak ada yang ditandai sudah dinilai (dipakai skrip audit). */
  gradedAssessmentIds?: Set<string>;
}): SessionCoverage[] {
  const quizStatusById = new Map(quizzes.map((q) => [q.id, q.status]));

  const bySession = new Map<string, CoverageAssessment[]>();
  for (const a of assessments) {
    const entry: CoverageAssessment = {
      id: a.id,
      title: a.title,
      shareCode: a.share_code,
      origin: a.quiz_id ? "sora" : "tera",
      quizId: a.quiz_id,
      quizStatus: a.quiz_id ? (quizStatusById.get(a.quiz_id) ?? null) : null,
      questionCount: a.quiz_id ? (questionCounts.get(a.quiz_id) ?? 0) : 0,
      graded: gradedAssessmentIds?.has(a.id) ?? false,
    };
    const list = bySession.get(a.session_id);
    if (list) list.push(entry);
    else bySession.set(a.session_id, [entry]);
  }

  return sessions.map((s) => {
    const own = bySession.get(s.id) ?? [];
    return {
      id: s.id,
      scheduledAt: s.scheduled_at,
      topic: s.topic,
      status: s.status,
      className: s.classes?.name ?? null,
      state: stateOf(own),
      assessments: own,
    };
  });
}

/**
 * Satu sesi boleh punya beberapa asesmen; yang menentukan adalah yang PALING
 * jauh jalannya. Sesi dengan satu asesmen manual dari Tera plus satu paket soal
 * terbit dari Sora sudah beres — menandainya "dari Tera" hanya akan menyuruh
 * admin mengerjakan yang sudah ada.
 */
function stateOf(list: CoverageAssessment[]): CoverageState {
  if (list.length === 0) return "belum";
  if (list.some(isReady)) return "siap";
  if (list.some((a) => a.origin === "sora")) return "belum-siap";
  return "luar-sora";
}

/** Urutan kerja: yang paling merah dulu, lalu sesi terdekat ke hari ini. */
export const STATE_ORDER: Record<CoverageState, number> = {
  belum: 0,
  "luar-sora": 1,
  "belum-siap": 2,
  siap: 3,
};
