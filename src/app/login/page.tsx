import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Masuk ke QuizCraft</h1>
        <p className="text-sm text-gray-500">Untuk tutor yang membuat & mengelola kuis.</p>
      </div>

      {message && <p className="rounded bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form action={login} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Masuk
        </button>
      </form>

      <p className="text-sm text-gray-500">
        Belum punya akun?{" "}
        <Link href="/signup" className="font-medium text-black underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
