import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import type { Question, Quiz, Class, QuestionBankItem } from "@/lib/types";
import { publishQuiz, deleteQuiz } from "../../../actions";
import { updateQuizMeta, addQuestion, updateQuizSettings, assignClass, addFromBank } from "./actions";
import QuestionEditor from "./QuestionEditor";
import QuestionBankPicker from "./QuestionBankPicker";
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

  const { data: classes } = await supabase.from("classes").select("id, name").order("name");
  const { data: bankItems } = await supabase
    .from("question_bank_items")
    .select("*")
    .order("created_at", { ascending: false });

  const typedQuiz = quiz as Quiz;
  const typedQuestions = (questions ?? []) as Question[];
  const typedClasses = (classes ?? []) as Pick<Class, "id" | "name">[];
  const typedBankItems = (bankItems ?? []) as QuestionBankItem[];
  const settings = typedQuiz.settings ?? {};
  const nextOrderIndex =
    typedQuestions.length === 0 ? 0 : Math.max(...typedQuestions.map((q) => q.order_index)) + 1;

  const boundUpdateMeta = updateQuizMeta.bind(null, id);
  const boundAddQuestion = addQuestion.bind(null, id, nextOrderIndex);
  const boundPublish = publishQuiz.bind(null, id);
  const boundDelete = deleteQuiz.bind(null, id);
  const boundUpdateSettings = updateQuizSettings.bind(null, id);
  const boundAssignClass = assignClass.bind(null, id);
  const boundAddFromBank = addFromBank.bind(null, id, nextOrderIndex);

  const shareUrl = typedQuiz.share_code ? `/q/${typedQuiz.share_code}` : null;
  let qrDataUrl: string | null = null;
  if (shareUrl) {
    const host = (await headers()).get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    qrDataUrl = await QRCode.toDataURL(`${protocol}://${host}${shareUrl}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 underline">
        ← Kembali ke Kuis Saya
      </Link>

      <div className="mt-4 mb-8 rounded border border-gray-200 p-4">
        <form action={boundUpdateMeta} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Judul Kuis
            <input
              name="title"
              defaultValue={typedQuiz.title}
              required
              className="rounded border border-gray-300 px-3 py-2 text-lg font-medium"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Deskripsi
            <textarea
              name="description"
              defaultValue={typedQuiz.description ?? ""}
              rows={2}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Simpan Judul & Deskripsi
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <form action={boundPublish}>
            <button
              type="submit"
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              {typedQuiz.status === "published" ? "Terbitkan Ulang" : "Terbitkan Kuis"}
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
                <img src={qrDataUrl} alt="QR kuis" className="h-24 w-24 rounded border border-gray-200" />
              )}
            </div>
          )}
          <form action={boundDelete} className="ml-auto">
            <button type="submit" className="text-sm text-red-500 hover:underline">
              Hapus Kuis
            </button>
          </form>
        </div>
      </div>

      <details className="mb-8 rounded border border-gray-200 p-4">
        <summary className="cursor-pointer text-sm font-medium">Pengaturan Kuis</summary>
        <form action={boundUpdateSettings} className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Batas waktu (menit, kosongkan jika tanpa batas)
              <input
                name="time_limit_minutes"
                type="number"
                min={1}
                defaultValue={settings.time_limit_minutes ?? ""}
                className="rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Jumlah percobaan maksimal (kosongkan jika tanpa batas)
              <input
                name="max_attempts"
                type="number"
                min={1}
                defaultValue={settings.max_attempts ?? ""}
                className="rounded border border-gray-300 px-3 py-2"
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
                className="rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Tutup pada
              <input
                name="closes_at"
                type="datetime-local"
                defaultValue={toLocalInput(settings.closes_at)}
                className="rounded border border-gray-300 px-3 py-2"
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
            className="self-start rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
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
              className="rounded border border-gray-300 px-3 py-2"
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
            className="rounded border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
          >
            Simpan
          </button>
        </form>
      </details>

      <details className="mb-8 rounded border border-gray-200 p-4">
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

      <div className="flex flex-col gap-4">
        {typedQuestions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            quizId={id}
            question={question}
            index={index}
            total={typedQuestions.length}
            sequentialMode={settings.sequential_mode ?? false}
            otherQuestions={typedQuestions.map((q) => ({ id: q.id, prompt: q.prompt }))}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <form action={boundAddQuestion} className="flex-1">
          <button
            type="submit"
            className="w-full rounded border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            + Tambah Soal
          </button>
        </form>
        <QuestionBankPicker items={typedBankItems} onPick={boundAddFromBank} />
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
