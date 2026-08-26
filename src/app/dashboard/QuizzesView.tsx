import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { QUIZ_KIND_LABEL, type Quiz, type QuizKind } from "@/lib/types";
import { sessionWindowStart } from "@/lib/session-window";
import { nowMs } from "@/lib/relative-time";
import { createQuiz } from "./actions";
import SubmitButton from "@/lib/SubmitButton";
import QuizList, { type QuizListItem } from "./QuizList";

interface TutorSession {
  id: string;
  scheduled_at: string;
  classes: { name: string } | null;
}

/**
 * Gudang paket soal: semua jenis dalam satu daftar.
 *
 * Dulu ini tiga menu (Asesmen, Remedial, Try Out) yang menampilkan komponen
 * yang sama dengan `kind` berbeda. Jenisnya turun pangkat jadi label dan
 * saringan karena satuannya sama — semuanya baris `quizzes` — dan tiga alamat
 * untuk satu satuan berarti orang harus menebak dulu di mana barangnya sebelum
 * bisa mencarinya.
 */
export default async function QuizzesView() {
  const supabase = await createClient();

  // Identitasnya dipakai bersama layout lewat `cache()` — tidak menembak
  // Supabase lagi. Sisanya berbarengan: halaman ini tujuan redirect setelah
  // login, jadi tiap perjalanan yang dihemat langsung terasa sebagai layar diam.
  //
  // `select("*")` supaya `updated_at` (migrasi 078) dan `kind` (079) ikut kalau
  // sudah dijalankan, dan halaman ini tidak error kalau belum — kolom yang
  // belum ada akan menggagalkan seluruh query kalau disebut namanya. Karena itu
  // penyaringan `kind` juga dilakukan di sini, bukan lewat `.eq()`.
  const [{ isTutor }, { data: quizzes }] = await Promise.all([
    getCurrentUser(),
    supabase.from("quizzes").select("*").order("created_at", { ascending: false }),
  ]);

  const typedQuizzes = (quizzes ?? []) as (Quiz & { updated_at?: string })[];

  const quizIds = typedQuizzes.map((q) => q.id);
  const creatorIds = [...new Set(typedQuizzes.map((q) => q.created_by).filter(Boolean))] as string[];

  // Tiga query yang sama-sama hanya butuh daftar id di atas, jadi dijalankan
  // bersamaan. Berurutan, ketiganya menambah tiga kali latensi jaringan ke
  // layar yang sedang ditunggu orang.
  //
  // Tipe "privat" ditentukan penugasannya, bukan hanya `session_id`: paket soal
  // induk buatan admin sengaja bernilai null di sana (lihat migrasi 074),
  // padahal begitu ditugaskan ia hanya bisa dikerjakan murid kelas sesi itu.
  // Peran pembuat dipakai untuk label sumber; untuk tutor RLS Tera hanya
  // membuka profilnya sendiri, jadi paket buatan admin tampil tanpa label —
  // bukan salah label.
  const [{ data: attemptRows }, { data: assignedRows }, { data: creatorRows }] = await Promise.all([
    quizIds.length
      ? supabase.from("attempts").select("quiz_id, submitted_at").in("quiz_id", quizIds)
      : Promise.resolve({ data: null }),
    quizIds.length
      ? supabase.from("assessments").select("quiz_id").in("quiz_id", quizIds)
      : Promise.resolve({ data: null }),
    creatorIds.length
      ? supabase.from("profiles").select("id, role").in("id", creatorIds)
      : Promise.resolve({ data: null }),
  ]);

  const assignedQuizIds = new Set(
    ((assignedRows ?? []) as { quiz_id: string | null }[]).map((r) => r.quiz_id),
  );
  const roleById = new Map(
    ((creatorRows ?? []) as { id: string; role: string }[]).map((p) => [p.id, p.role]),
  );

  const attempts = (attemptRows ?? []) as { quiz_id: string; submitted_at: string | null }[];
  const listItems: QuizListItem[] = typedQuizzes.map((quiz) => {
    const mine = attempts.filter((a) => a.quiz_id === quiz.id);
    const role = quiz.created_by ? roleById.get(quiz.created_by) : undefined;
    return {
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      kind: asKind(quiz.kind),
      shareCode: quiz.share_code,
      updatedAt: quiz.updated_at ?? quiz.created_at,
      createdAt: quiz.created_at,
      audience: quiz.session_id || assignedQuizIds.has(quiz.id) ? "privat" : "publik",
      source: role === "admin" || role === "tutor" ? role : null,
      done: mine.filter((a) => a.submitted_at !== null).length,
      inProgress: mine.filter((a) => a.submitted_at === null).length,
    };
  });

  // Tutor membuat paket soal dari sesinya, jadi daftarnya dimuat di sini. RLS Tera
  // sudah membatasi ke sesi miliknya sendiri. Jendela waktunya sama dengan yang
  // dipakai halaman penugasan — lihat `sessionWindowStart`.
  const since = sessionWindowStart();
  const { data: sessionRows } = isTutor
    ? await supabase
        .from("sessions")
        .select("id, scheduled_at, classes(name)")
        .gte("scheduled_at", since)
        .order("scheduled_at", { ascending: true })
        .limit(50)
    : { data: null };
  const sessions = (sessionRows ?? []) as unknown as TutorSession[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Paket Soal</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Semua paket soal yang pernah dibuat, jenis apa pun. Asesmen menempel ke sesi kelas dan
            nilainya masuk ke rapor Tera — tugaskan dari menu Asesmen. Remedial dan Try Out boleh
            berdiri sendiri sebagai kode lepas.
          </p>
        </div>
        {!isTutor && (
          <form action={createQuiz} className="flex shrink-0 items-center gap-2">
            {/* Jenisnya dipilih di sini karena halaman ini tidak lagi mewakili
                satu jenis; dulu ia disisipkan diam-diam sebagai input hidden. */}
            <select
              name="kind"
              defaultValue="asesmen"
              aria-label="Jenis paket soal"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {(Object.keys(QUIZ_KIND_LABEL) as QuizKind[]).map((k) => (
                <option key={k} value={k}>
                  {QUIZ_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <SubmitButton
              pendingLabel="Membuat…"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              + Buat
            </SubmitButton>
          </form>
        )}
      </div>

      {isTutor &&
        (sessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
            Belum ada sesi mengajar yang bisa ditautkan. Paket soal tutor selalu menempel ke satu sesi
            kelas.
          </p>
        ) : (
          <form
            action={createQuiz}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <select
              name="kind"
              defaultValue="asesmen"
              aria-label="Jenis paket soal"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {(Object.keys(QUIZ_KIND_LABEL) as QuizKind[]).map((k) => (
                <option key={k} value={k}>
                  {QUIZ_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              name="session_id"
              required
              defaultValue=""
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Pilih sesi kelas…
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* Jam ikut ditampilkan: satu tutor bisa punya beberapa sesi di hari yang sama. */}
                  {new Date(s.scheduled_at).toLocaleString("id-ID", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {s.classes?.name ? ` — ${s.classes.name}` : ""}
                </option>
              ))}
            </select>
            <SubmitButton
              pendingLabel="Membuat…"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              + Buat untuk Sesi
            </SubmitButton>
          </form>
        ))}

      <QuizList items={listItems} renderedAt={nowMs()} />
    </div>
  );
}

/** Baris lama bisa belum punya `kind` (sebelum migrasi 079); bawaannya asesmen. */
function asKind(raw: string | null | undefined): QuizKind {
  return raw === "remedial" || raw === "tryout" ? raw : "asesmen";
}
