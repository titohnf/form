import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Class } from "@/lib/types";
import { createClass } from "./actions";

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 underline">
        ← Kembali ke Kuis Saya
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">Kelas</h1>

      <form action={createClass} className="mb-6 flex gap-2">
        <input
          name="name"
          required
          placeholder="Nama kelas (mis. Matematika 8A)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Buat Kelas
        </button>
      </form>

      <div className="flex flex-col divide-y divide-gray-200 rounded border border-gray-200">
        {(classes ?? []).length === 0 && (
          <p className="p-6 text-sm text-gray-500">Belum ada kelas.</p>
        )}
        {(classes as Class[] | null)?.map((cls) => (
          <Link
            key={cls.id}
            href={`/dashboard/classes/${cls.id}`}
            className="flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <span className="font-medium">{cls.name}</span>
            <span className="text-sm text-gray-400">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
