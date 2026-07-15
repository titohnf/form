import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Question, Quiz } from "@/lib/types";
import { publishQuiz, deleteQuiz } from "../../../actions";
import { updateQuizMeta, addQuestion } from "./actions";
import QuestionEditor from "./QuestionEditor";

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

  const typedQuiz = quiz as Quiz;
  const typedQuestions = (questions ?? []) as Question[];
  const nextOrderIndex =
    typedQuestions.length === 0 ? 0 : Math.max(...typedQuestions.map((q) => q.order_index)) + 1;

  const boundUpdateMeta = updateQuizMeta.bind(null, id);
  const boundAddQuestion = addQuestion.bind(null, id, nextOrderIndex);
  const boundPublish = publishQuiz.bind(null, id);
  const boundDelete = deleteQuiz.bind(null, id);

  const shareUrl = typedQuiz.share_code ? `/q/${typedQuiz.share_code}` : null;

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
            <div className="text-sm">
              <p className="text-gray-500">
                Link: <code className="rounded bg-gray-100 px-1">{shareUrl}</code>
              </p>
              <p className="text-gray-500">
                Kode: <code className="rounded bg-gray-100 px-1">{typedQuiz.share_code}</code>
              </p>
              <Link href={shareUrl} className="font-medium underline" target="_blank">
                Buka halaman murid ↗
              </Link>
            </div>
          )}
          <form action={boundDelete} className="ml-auto">
            <button type="submit" className="text-sm text-red-500 hover:underline">
              Hapus Kuis
            </button>
          </form>
        </div>
      </div>

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
          />
        ))}
      </div>

      <form action={boundAddQuestion} className="mt-4">
        <button
          type="submit"
          className="w-full rounded border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Tambah Soal
        </button>
      </form>
    </div>
  );
}
