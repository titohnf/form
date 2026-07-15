import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Class, Student } from "@/lib/types";
import { addStudent, deleteStudent, deleteClass } from "../actions";

interface AttemptHistoryRow {
  id: string;
  student_id: string | null;
  total_score: number | null;
  submitted_at: string | null;
  quizzes: { title: string } | null;
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase.from("classes").select("*").eq("id", classId).single();
  if (!cls) notFound();

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .order("name");

  const studentIds = (students ?? []).map((s) => s.id);
  const { data: history } =
    studentIds.length > 0
      ? await supabase
          .from("attempts")
          .select("id, student_id, total_score, submitted_at, quizzes(title)")
          .in("student_id", studentIds)
          .order("submitted_at", { ascending: false })
      : { data: [] as AttemptHistoryRow[] };

  const boundAddStudent = addStudent.bind(null, classId);
  const boundDeleteClass = deleteClass.bind(null, classId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/dashboard/classes" className="text-sm text-gray-500 underline">
        ← Kembali ke Kelas
      </Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{(cls as Class).name}</h1>
        <form action={boundDeleteClass}>
          <button type="submit" className="text-sm text-red-500 hover:underline">
            Hapus Kelas
          </button>
        </form>
      </div>

      <h2 className="mb-2 text-sm font-medium text-gray-500">Daftar Murid</h2>
      <form action={boundAddStudent} className="mb-4 flex gap-2">
        <input
          name="name"
          required
          placeholder="Nama murid"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder="Email (opsional)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Tambah
        </button>
      </form>

      <div className="mb-8 flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
        {(students ?? []).length === 0 && (
          <p className="p-4 text-sm text-gray-500">Belum ada murid di kelas ini.</p>
        )}
        {(students as Student[] | null)?.map((student) => {
          const scores = ((history ?? []) as AttemptHistoryRow[]).filter(
            (h) => h.student_id === student.id,
          );
          const boundDeleteStudent = deleteStudent.bind(null, classId, student.id);
          return (
            <div key={student.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{student.name}</p>
                  {student.email && <p className="text-xs text-gray-400">{student.email}</p>}
                </div>
                <form action={boundDeleteStudent}>
                  <button type="submit" className="text-xs text-red-500 hover:underline">
                    Hapus
                  </button>
                </form>
              </div>
              {scores.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-gray-500">
                  {scores.map((s) => (
                    <li key={s.id}>
                      {s.quizzes?.title ?? "Kuis"}: {s.total_score ?? "menunggu nilai"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
