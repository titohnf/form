import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import type {
  Question,
  Quiz,
  Class,
  QuestionBankItem,
  SessionOption,
  Assessment,
  QuizKind,
} from "@/lib/types";
import { QUIZ_KIND_LABEL } from "@/lib/types";
import type { CurriculumTopicGroup, Subject } from "@/lib/types";
import { bySubject, topicLabel } from "@/lib/curriculum";
import { findQuizIssues } from "@/lib/question-validation";
import { sessionWindowStart } from "@/lib/session-window";
import { publishQuiz, deleteQuiz, setQuizKind } from "../../../actions";
import {
  updateQuizMeta,
  addQuestion,
  updateQuizSettings,
  assignClass,
  addManyFromBank,
  assignToSession,
  unassignFromSession,
} from "./actions";
import QuestionList from "./QuestionList";
import QuestionBankPicker, { type BankTopicGroup } from "./QuestionBankPicker";
import AiGenerator from "./AiGenerator";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("*").eq("id", id).single();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  const isTutor = profile?.role === "tutor";

  const { data: classes } = await supabase.from("classes").select("id, name").order("name");
  // Bank soal admin-only di RLS, jadi untuk tutor kuerinya dilewati sama sekali
  // — daripada memanggilnya dan menampilkan pemilih kosong tanpa penjelasan.
  // Bank + penandaan topiknya dimuat bersamaan: pemilih soal mengelompokkan
  // per topik, jadi tanpa tag dan grup-nya daftarnya cuma tumpukan panjang.
  const [{ data: bankItems }, { data: bankTags }, { data: topicGroups }, { data: subjectRows }] =
    isTutor
      ? [{ data: null }, { data: null }, { data: null }, { data: null }]
      : await Promise.all([
          supabase.from("question_bank_items").select("*").order("created_at", { ascending: false }),
          supabase.from("question_curriculum_tags").select("question_bank_item_id, group_id"),
          supabase
            .from("curriculum_topic_groups")
            .select("id, subject_id, curriculum, grade_level, semester, theme, topic"),
          supabase.from("subjects").select("id, name").order("name"),
        ]);

  // Penugasan ke sesi adalah pekerjaan admin: tutor menyusun paket soal untuk
  // sesinya sendiri lewat dashboard, dan paket itu sudah lahir dengan
  // penugasannya. Query-nya dilewati untuk tutor supaya tidak ada daftar sesi
  // orang lain yang dimuat percuma.
  const since = sessionWindowStart();
  const { data: sessionRows } = isTutor
    ? { data: null }
    : await supabase
        .from("sessions")
        .select("id, scheduled_at, topic, classes(name)")
        .gte("scheduled_at", since)
        .order("scheduled_at", { ascending: true })
        .limit(100);

  const { data: assessmentRows } = isTutor
    ? { data: null }
    : await supabase
        .from("assessments")
        .select("id, session_id, quiz_id, title, share_code, created_at, sessions(scheduled_at, topic, classes(name))")
        .eq("quiz_id", id)
        .order("created_at", { ascending: true });

  const assignments = (assessmentRows ?? []) as unknown as (Assessment & {
    sessions: { scheduled_at: string; topic: string | null; classes: { name: string } | null } | null;
  })[];

  // Penugasan yang sudah punya nilai tidak boleh ditarik — hapusnya cascade ke
  // `assessment_results`. Dihitung sekali di sini, bukan per baris.
  const { data: resultRows } = assignments.length
    ? await supabase
        .from("assessment_results")
        .select("assessment_id")
        .in(
          "assessment_id",
          assignments.map((a) => a.id),
        )
    : { data: null };
  const gradedAssignmentIds = new Set(
    ((resultRows ?? []) as { assessment_id: string }[]).map((r) => r.assessment_id),
  );

  const assignedSessionIds = new Set(assignments.map((a) => a.session_id));
  const sessions = ((sessionRows ?? []) as unknown as SessionOption[]).filter(
    (s) => !assignedSessionIds.has(s.id),
  );

  const typedQuiz = quiz as Quiz;
  const typedQuestions = (questions ?? []) as Question[];
  const typedClasses = (classes ?? []) as Pick<Class, "id" | "name">[];
  const typedBankItems = (bankItems ?? []) as QuestionBankItem[];
  const typedBankTags = (bankTags ?? []) as { question_bank_item_id: string; group_id: string }[];
  const typedTopicGroups = (topicGroups ?? []) as CurriculumTopicGroup[];
  const typedSubjects = (subjectRows ?? []) as Subject[];

  // Bentuk yang dipakai pemilih: satu entri per topik yang benar-benar punya
  // soal, sudah berurut mengikuti urutan kurikulum Tera.
  const bankTopics: BankTopicGroup[] = bySubject(typedTopicGroups, typedSubjects).flatMap(
    (subject) =>
      subject.groups
        .map((group) => ({
          id: group.id,
          label: topicLabel(group),
          subjectName: subject.subjectName,
          itemIds: typedBankTags
            .filter((t) => t.group_id === group.id)
            .map((t) => t.question_bank_item_id),
        }))
        .filter((t) => t.itemIds.length > 0),
  );
  const settings = typedQuiz.settings ?? {};
  const nextOrderIndex =
    typedQuestions.length === 0 ? 0 : Math.max(...typedQuestions.map((q) => q.order_index)) + 1;
  const issues = findQuizIssues(typedQuestions);
  const canPublish = typedQuestions.length > 0 && issues.length === 0;

  const kind: QuizKind = typedQuiz.kind ?? "asesmen";
  const kindHref =
    kind === "asesmen" ? "/dashboard" : kind === "remedial" ? "/dashboard/remedial" : "/dashboard/tryout";

  const boundUpdateMeta = updateQuizMeta.bind(null, id);
  const boundAddQuestion = addQuestion.bind(null, id, nextOrderIndex);
  const boundPublish = publishQuiz.bind(null, id);
  const boundDelete = deleteQuiz.bind(null, id, kindHref);
  const boundUpdateSettings = updateQuizSettings.bind(null, id);
  const boundAssignClass = assignClass.bind(null, id);
  const boundSetKind = setQuizKind.bind(null, id);
  const boundAssignToSession = assignToSession.bind(null, id);
  const boundAddFromBank = addManyFromBank.bind(null, id, nextOrderIndex);

  const shareUrl = typedQuiz.share_code ? `/q/${typedQuiz.share_code}` : null;
  let qrDataUrl: string | null = null;
  if (shareUrl) {
    const host = (await headers()).get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    qrDataUrl = await QRCode.toDataURL(`${protocol}://${host}${shareUrl}`);
  }

  return (
    <div className="space-y-5">
      {/* Kembali ke menu asal paket ini, bukan selalu ke Asesmen. */}
      <Link href={kindHref} className="text-sm text-gray-500 underline">
        ← Kembali ke {QUIZ_KIND_LABEL[kind]}
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form action={boundUpdateMeta} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Judul Paket Soal
            <input
              name="title"
              defaultValue={typedQuiz.title}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-lg font-medium"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Deskripsi
            <textarea
              name="description"
              defaultValue={typedQuiz.description ?? ""}
              rows={2}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Simpan Judul & Deskripsi
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <form action={boundPublish}>
            <button
              type="submit"
              disabled={!canPublish}
              title={
                canPublish
                  ? undefined
                  : "Lengkapi dulu soal-soal di bawah sebelum paket soal bisa diterbitkan"
              }
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {typedQuiz.status === "published" ? "Terbitkan Ulang" : "Terbitkan Paket Soal"}
            </button>
          </form>
          {shareUrl && (
            <div className="flex items-start gap-4 text-sm">
              <div>
                <p className="text-gray-500">
                  Link: <code className="rounded bg-gray-100 px-1">{shareUrl}</code>
                </p>
                <p className="text-gray-500">
                  Kode: <code className="rounded bg-gray-100 px-1">{typedQuiz.share_code}</code>
                </p>
                <Link href={shareUrl} className="font-medium underline" target="_blank">
                  Buka halaman murid ↗
                </Link>
                <br />
                <Link
                  href={`/dashboard/quizzes/${id}/live`}
                  className="font-medium underline"
                  target="_blank"
                >
                  Live Monitoring ↗
                </Link>
              </div>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR paket soal" className="h-24 w-24 rounded-lg border border-slate-200" />
              )}
            </div>
          )}
          <form action={boundDelete} className="ml-auto">
            <button type="submit" className="text-sm text-red-500 hover:underline">
              Hapus Paket Soal
            </button>
          </form>
        </div>
      </div>

      {!isTutor && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium">Penugasan ke Sesi ({assignments.length})</h2>
          <p className="mt-1 text-sm text-gray-500">
            Satu paket soal bisa ditugaskan ke beberapa sesi. Tiap penugasan punya kode sendiri,
            memakai daftar murid kelas sesi itu, dan nilainya masuk ke sesi itu di Tera.
          </p>

          {assignments.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {assignments.map((a) => {
                const graded = gradedAssignmentIds.has(a.id);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {a.sessions ? sessionLabel(a.sessions) : "Sesi tidak ditemukan"}
                    </span>
                    {a.share_code ? (
                      <Link href={`/q/${a.share_code}`} target="_blank" className="underline">
                        /q/{a.share_code} ↗
                      </Link>
                    ) : (
                      <span className="text-gray-500">Tanpa kode</span>
                    )}
                    <form action={unassignFromSession.bind(null, id, a.id)} className="shrink-0">
                      <button
                        type="submit"
                        disabled={graded}
                        title={
                          graded
                            ? "Sudah ada nilai murid di sesi ini — penugasannya tidak bisa ditarik"
                            : undefined
                        }
                        className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                      >
                        {graded ? "Sudah dinilai" : "Tarik"}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          {sessions.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              Tidak ada sesi lain yang bisa ditugaskan dalam rentang dua minggu terakhir sampai ke
              depan. Jadwalkan sesinya dulu di Tera.
            </p>
          ) : (
            <form action={boundAssignToSession} className="mt-4 flex flex-wrap items-center gap-2">
              {/* Label sesi bisa panjang (jam — kelas — topik), dan select
                  melebar mengikuti opsi terpanjangnya sampai keluar dari kartu
                  kalau lebarnya tidak dikunci. */}
              <select
                name="session_id"
                required
                defaultValue=""
                className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:flex-1"
              >
                <option value="" disabled>
                  Pilih sesi kelas…
                </option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(s)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Tugaskan ke Sesi
              </button>
            </form>
          )}

          {assignments.length > 0 && typedQuiz.status !== "published" && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Paket soal ini belum diterbitkan, jadi kodenya belum bisa dibuka murid. Terbitkan
              dulu di atas.
            </p>
          )}
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-medium">Pengaturan Paket Soal</summary>
        <form action={boundUpdateSettings} className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Batas waktu (menit, kosongkan jika tanpa batas)
              <input
                name="time_limit_minutes"
                type="number"
                min={1}
                defaultValue={settings.time_limit_minutes ?? ""}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Jumlah percobaan maksimal (kosongkan jika tanpa batas)
              <input
                name="max_attempts"
                type="number"
                min={1}
                defaultValue={settings.max_attempts ?? ""}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Buka pada
              <input
                name="opens_at"
                type="datetime-local"
                defaultValue={toLocalInput(settings.opens_at)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Tutup pada
              <input
                name="closes_at"
                type="datetime-local"
                defaultValue={toLocalInput(settings.closes_at)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shuffle_questions" defaultChecked={settings.shuffle_questions} />
            Acak urutan soal per murid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shuffle_choices" defaultChecked={settings.shuffle_choices} />
            Acak urutan pilihan jawaban
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="show_score_immediately"
              defaultChecked={settings.show_score_immediately ?? true}
            />
            Izinkan murid melihat skor langsung setelah submit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sequential_mode" defaultChecked={settings.sequential_mode} />
            Mode satu soal per halaman (wajib untuk percabangan soal)
          </label>
          <button
            type="submit"
            className="self-start rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            Simpan Pengaturan
          </button>
        </form>

        <form action={boundAssignClass} className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4">
          <label className="flex flex-col gap-1 text-sm">
            Kirim ke Kelas (opsional — murid pilih nama dari daftar kelas)
            <select
              name="class_id"
              defaultValue={typedQuiz.class_id ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Tanpa kelas (nama bebas)</option>
              {typedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
          >
            Simpan
          </button>
        </form>

        <form action={boundSetKind} className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4">
          <label className="flex flex-col gap-1 text-sm">
            Kategori (menentukan menu tempatnya muncul)
            <select
              name="kind"
              defaultValue={typedQuiz.kind ?? "asesmen"}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {(Object.keys(QUIZ_KIND_LABEL) as QuizKind[]).map((k) => (
                <option key={k} value={k}>
                  {QUIZ_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
          >
            Pindahkan
          </button>
        </form>
      </details>

      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-medium">
          ✨ Generate Soal dengan AI (butuh ANTHROPIC_API_KEY di .env.local)
        </summary>
        <div className="mt-4">
          <AiGenerator quizId={id} nextOrderIndex={nextOrderIndex} />
        </div>
      </details>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Soal ({typedQuestions.length})</h2>
        <Link
          href={`/dashboard/quizzes/${id}/results`}
          className="text-sm font-medium underline"
        >
          Lihat Hasil →
        </Link>
      </div>

      {!canPublish && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {typedQuestions.length === 0 ? (
            "Tambahkan minimal satu soal sebelum paket soal bisa diterbitkan."
          ) : (
            <>
              <p className="font-medium">Belum bisa diterbitkan — lengkapi dulu:</p>
              <ul className="mt-1 list-inside list-disc">
                {issues.map(({ number, issue }) => (
                  <li key={number}>
                    Soal {number}: {issue}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <QuestionList
        quizId={id}
        initialQuestions={typedQuestions}
        sequentialMode={settings.sequential_mode ?? false}
        canSaveToBank={!isTutor}
      />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <form action={boundAddQuestion} className="flex-1">
          <button
            type="submit"
            className="w-full rounded-xl border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            + Tambah Soal
          </button>
        </form>
        {isTutor ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-gray-500">
            Bank soal bersama disusun admin. Soal yang kamu tulis di sini menempel pada paket soal sesi
            ini saja.
          </p>
        ) : (
          <QuestionBankPicker
            items={typedBankItems}
            topics={bankTopics}
            addedBankItemIds={typedQuestions
              .map((q) => q.bank_item_id)
              .filter((v): v is string => !!v)}
            onAdd={boundAddFromBank}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Label satu sesi di pemilih dan di daftar penugasan. Jamnya ikut ditampilkan
 * karena satu kelas bisa punya beberapa sesi di hari yang sama.
 */
function sessionLabel(s: {
  scheduled_at: string;
  topic: string | null;
  classes: { name: string } | null;
}): string {
  const when = new Date(s.scheduled_at).toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return [when, s.classes?.name, s.topic].filter(Boolean).join(" — ");
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
