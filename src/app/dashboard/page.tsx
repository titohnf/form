import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Quiz } from "@/lib/types";
import { createQuiz, logout } from "./actions";

const statusLabel: Record<Quiz["status"], string> = {
  draft: "Draf",
  published: "Terbit",
  closed: "Ditutup",
};

const statusColor: Record<Quiz["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  closed: "bg-yellow-100 text-yellow-700",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, description, status, share_code, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kuis Saya</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/classes" className="text-sm font-medium underline">
            Kelas
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-500 underline">
              Keluar
            </button>
          </form>
        </div>
      </div>

      <form action={createQuiz} className="mb-6">
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Buat Kuis Baru
        </button>
      </form>

      <div className="flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
        {(quizzes ?? []).length === 0 && (
          <p className="p-6 text-sm text-gray-500">Belum ada kuis. Buat kuis pertamamu!</p>
        )}
        {(quizzes as Quiz[] | null)?.map((quiz) => (
          <Link
            key={quiz.id}
            href={`/dashboard/quizzes/${quiz.id}/edit`}
            className="flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <div>
              <p className="font-medium">{quiz.title}</p>
              <p className="text-sm text-gray-500">{quiz.description || "Tanpa deskripsi"}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[quiz.status]}`}>
              {statusLabel[quiz.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
