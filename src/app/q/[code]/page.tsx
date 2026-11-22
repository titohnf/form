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
  searchParams: Promise<{ error?: string; kode?: string; akun?: string }>;
}) {
  const { code } = await params;
  const { error, kode: kodeParam, akun: akunParam } = await searchParams;
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

  let notYetOpen = settings.opens_at && now < new Date(settings.opens_at);
  let alreadyClosed = settings.closes_at && now > new Date(settings.closes_at);

  // Akun penguji (akun uji pemilik, `learners.penguji`, migrasi Tera 233) tidak ikut menunggu jadwal.
  // Hanya ditanyakan bila paketnya memang sedang terkunci; sebelum migrasinya dijalankan fungsi ini
  // belum ada, dan galatnya dibaca sebagai "bukan penguji".
  if ((notYetOpen || alreadyClosed) && settings.cbt_mode) {
    const kodeUji = (kodeParam ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    const [{ data: lewatKode }, { data: lewatAkun }] = await Promise.all([
      kodeUji ? supabase.rpc("peserta_penguji", { p_kode: kodeUji }) : Promise.resolve({ data: null }),
      supabase.rpc("akun_penguji"),
    ]);
    if (lewatKode === true || lewatAkun === true) {
      notYetOpen = null;
      alreadyClosed = null;
    }
  }

  // Soal dibaca lewat fungsi database, bukan langsung dari tabel `questions`:
  // tabel itu memuat kunci jawaban dan pembahasan, yang tidak boleh sampai ke
  // peserta (migrasi Tera 225/226). Fungsinya hanya mengembalikan kolom yang
  // dipakai layar ini, dan hanya untuk paket yang terbit, sudah terurut.
  const { data: questions } = await supabase.rpc("soal_peserta", { p_quiz_id: typedQuiz.id });

  let orderedQuestions = (questions ?? []) as unknown as Question[];
  // Shuffling questions would break branching's order_index-based fallback, so it's ignored
  // in sequential mode (a quiz author using branching wants a deliberate path).
  // Tampilan TKA mengacak di sisi peserta dengan benih id percobaannya (lihat
  // `lib/acak.ts`), supaya urutannya tetap sama saat halaman dimuat ulang.
  if (settings.shuffle_questions && !settings.sequential_mode && !settings.cbt_mode) {
    orderedQuestions = shuffle(orderedQuestions);
  }
  if (settings.shuffle_choices && !settings.cbt_mode) {
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

  // Siswa Tera yang sudah login di browser ini: dikenali dari sesinya, jadi
  // try out TKA tidak perlu kode. Hanya untuk akun siswa; admin/tutor yang
  // kebetulan login tidak ditawari masuk sebagai peserta.
  let akun: string | null = null;
  if (!entry && settings.cbt_mode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: me } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
      if (me && (me.role === "student" || me.role === "mandiri")) akun = me.full_name ?? "Murid";
    }
  }

  // Serah-terima dari Tera: peserta yang sudah masuk dengan kode di sana
  // dibawa ke sini dengan `?kode=`. Kodenya diperiksa ulang ke database, lalu
  // layar "Selamat Datang" dilewati dan peserta langsung ke halaman persiapan
  // (konfirmasi data). Kode yang tidak dikenal diabaikan: layar masuk biasa.
  let identitasAwal: { tipe: "kode"; kode: string; nama: string } | { tipe: "akun"; nama: string } | null = null;
  if (!entry && settings.cbt_mode && kodeParam) {
    const bersih = kodeParam.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    if (bersih) {
      const { data: namaPeserta } = await supabase.rpc("masuk_peserta", { p_kode: bersih });
      if (namaPeserta) identitasAwal = { tipe: "kode", kode: bersih, nama: namaPeserta as string };
    }
  }

  // Akun Tera yang sudah login (sesi dibagi karena Sora dipasang di bawah alamat
  // Tera): `?akun=1` dari kartu Try Out melewati Selamat Datang juga.
  if (!identitasAwal && !entry && settings.cbt_mode && akun && akunParam === "1") {
    identitasAwal = { tipe: "akun", nama: akun };
  }

  // Daftar paket try out TKA yang bisa dipilih di halaman masuk. Hanya paket
  // bertampilan TKA yang sudah terbit; paket lain (asesmen kelas, remedial)
  // tidak ikut terdaftar supaya kodenya tidak tersebar lewat daftar ini.
  let paketTkA: { kode: string; judul: string; jenjang?: string; mapel?: string }[] = [];
  if (!entry && settings.cbt_mode) {
    const { data: daftar } = await supabase
      .from("quizzes")
      .select("title, share_code, settings")
      .eq("status", "published")
      .eq("kind", "tryout");
    const urutJenjang = (j?: string) => ["SD", "SMP", "SMA"].indexOf((j ?? "").toUpperCase());
    paketTkA = ((daftar ?? []) as { title: string; share_code: string | null; settings: (Partial<QuizSettings> & { jenjang?: string; mapel?: string }) | null }[])
      .filter((q) => q.settings?.cbt_mode && q.share_code)
      .map((q) => ({ kode: q.share_code as string, judul: q.title, jenjang: q.settings?.jenjang, mapel: q.settings?.mapel }))
      // Per jenjang (SD, SMP, ...), lalu menurut judul: Matematika dan Bahasa Indonesia berdampingan.
      .sort((a, b) => (urutJenjang(a.jenjang) + 1 || 99) - (urutJenjang(b.jenjang) + 1 || 99) || a.judul.localeCompare(b.judul, "id"));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{typedQuiz.title}</h1>
      {typedQuiz.description && <p className="mt-1 text-gray-500">{typedQuiz.description}</p>}

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {notYetOpen ? (
        <p className="mt-6 rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Paket soal ini belum dibuka
          {settings.opens_at
            ? `: dibuka pukul ${new Date(settings.opens_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.`
            : "."}{" "}
          Muat ulang halaman ini pada jamnya.
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
            cbt={settings.cbt_mode ?? false}
            tandaAir={settings.tanda_air ?? false}
            acakSoal={settings.shuffle_questions ?? false}
            acakPilihan={settings.shuffle_choices ?? false}
            timeLimitMinutes={settings.time_limit_minutes ?? null}
            judul={typedQuiz.title}
            kode={code}
            paket={paketTkA}
            assessment={entry ? { studentName } : null}
            akun={akun}
            identitasAwal={identitasAwal}
          />
        </div>
      )}
    </div>
  );
}
