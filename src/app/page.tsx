import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold">QuizCraft</h1>
      <p className="max-w-md text-lg text-gray-500">
        Buat kuis dalam hitungan menit, bagikan lewat link atau kode, dan nilai jawaban murid
        secara otomatis.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          Daftar sebagai Tutor
        </Link>
        <Link
          href="/login"
          className="rounded border border-gray-300 px-5 py-3 text-sm font-medium hover:bg-gray-50"
        >
          Masuk
        </Link>
      </div>
    </div>
  );
}
