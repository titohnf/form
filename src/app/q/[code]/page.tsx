import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { McqOptions, Question, Quiz, QuizSettings } from "@/lib/types";
import QuizForm from "./QuizForm";
import StudentLogin from "./StudentLogin";

/** Satu baris dari `assessment_entry()` — paket soal ini di sesi ini, plus hak murid yang login. */
interface AssessmentEntry {
  assessment_id: string;
  quiz_id: string;
  session_id: string;
  title: string;
  quiz_status: string;
  scheduled_at: string;
  class_name: string | null;
  eligible: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default async function PublicQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  // Share code dicari sebagai PENUGASAN dulu, baru sebagai paket soal lepas. Satu
  // paket soal bisa ditugaskan ke banyak sesi (migrasi 074), dan yang menentukan
  // roster serta ke mana nilainya pergi adalah penugasannya, bukan paket soalnya.
  const { data: entryRows } = await supabase.rpc("assessment_entry", { p_share_code: code });
  const entry = ((entryRows as AssessmentEntry[] | null) ?? [])[0] ?? null;
  let studentName = "";

  if (entry) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-2xl font-semibold">{entry.title}</h1>
          {entry.class_name && <p className="mt-1 text-gray-500">{entry.class_name}</p>}
          <StudentLogin title="Asesmen ini" />
        </div>
      );
    }

    const { data: me } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    studentName = me?.full_name ?? "Murid";

    // Ditolak dengan sebab yang spesifik. "Gagal memulai paket soal" tidak memberi
    // tahu murid apa pun tentang apa yang harus ia lakukan berikutnya.
    if (!entry.eligible) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-2xl font-semibold">{entry.title}</h1>
          <p className="mt-6 rounded bg-red-50 p-4 text-sm text-red-700">
            Akun ini tidak terdaftar di kelas sesi tersebut, jadi belum bisa mengerjakan. Kalau
            kamu merasa seharusnya terdaftar, beri tahu tutormu.
          </p>
        </div>
      );
    }
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, description, status, settings, class_id")
    .eq("id", entry?.quiz_id ?? "00000000-0000-0000-0000-000000000000")
    .eq("status", "published")
    .maybeSingle()
    .then(async (r) =>
      r.data
        ? r
        : await supabase
            .from("quizzes")
            .select("id, title, description, status, settings, class_id")
            .eq("share_code", code)
            .eq("status", "published")
            .maybeSingle(),
    );

  if (!quiz) notFound();

  const typedQuiz = quiz as Pick<Quiz, "id" | "title" | "description" | "status" | "settings" | "class_id">;
  const settings = (typedQuiz.settings ?? {}) as Partial<QuizSettings>;
  const now = new Date();

  const notYetOpen = settings.opens_at && now < new Date(settings.opens_at);
  const alreadyClosed = settings.closes_at && now > new Date(settings.closes_at);

  const { data: questions } = await supabase
    .from("questions")
    // Tanpa correct_answer dan explanation: halaman ini dibaca murid. Gambar
    // stimulus ikut karena tanpanya soal bergambar tidak bisa dikerjakan.
    .select("id, quiz_id, type, prompt, options, weight, order_index, branching, stimulus_images")
    .eq("quiz_id", typedQuiz.id)
    .order("order_index", { ascending: true });

  let orderedQuestions = (questions ?? []) as Question[];
  // Shuffling questions would break branching's order_index-based fallback, so it's ignored
  // in sequential mode (a quiz author using branching wants a deliberate path).
  if (settings.shuffle_questions && !settings.sequential_mode) {
    orderedQuestions = shuffle(orderedQuestions);
  }
  if (settings.shuffle_choices) {
    orderedQuestions = orderedQuestions.map((q) => {
      if (q.type === "mcq_single" || q.type === "mcq_multi") {
        const opts = q.options as McqOptions | null;
        if (opts?.choices) {
          return { ...q, options: { choices: shuffle(opts.choices) } };
        }
      }
      return q;
    });
  }

  // Names come through a gated function rather than a direct read: the roster
  // lives in Tera's `class_students`/`profiles`, which anon must not see.
  // Dilewati untuk penugasan asesmen: di sana identitas murid datang dari sesi
  // login, bukan dari memilih nama.
  const { data: roster } = entry
    ? { data: null }
    : await supabase.rpc("quiz_roster", { p_share_code: code });
  const learners = ((roster as { learner_id: string; learner_name: string }[] | null) ?? []).map(
    (row) => ({ id: row.learner_id, name: row.learner_name }),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{typedQuiz.title}</h1>
      {typedQuiz.description && <p className="mt-1 text-gray-500">{typedQuiz.description}</p>}

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {notYetOpen ? (
        <p className="mt-6 rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Paket soal ini belum dibuka. Coba lagi nanti.
        </p>
      ) : alreadyClosed ? (
        <p className="mt-6 rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Paket soal ini sudah ditutup.
        </p>
      ) : (
        <div className="mt-6">
          <QuizForm
            quizId={typedQuiz.id}
            shareCode={code}
            questions={orderedQuestions}
            students={learners}
            sequential={settings.sequential_mode ?? false}
            assessment={entry ? { studentName } : null}
          />
        </div>
      )}
    </div>
  );
}
