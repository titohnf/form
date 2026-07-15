import Link from "next/link";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Daftar sebagai Tutor</h1>
        <p className="text-sm text-gray-500">Buat akun untuk mulai membuat kuis.</p>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form action={signup} className="flex flex-col gap-4">
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
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Daftar
        </button>
      </form>

      <p className="text-sm text-gray-500">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-black underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
