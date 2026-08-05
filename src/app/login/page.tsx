import { login } from "./actions";

/** Kode dari proxy (lihat dashboardDenial) dijadikan kalimat yang bisa dibaca. */
const errorMessage: Record<string, string> = {
  "bank-admin-only":
    "Bank soal hanya bisa diakses admin. Sebagai tutor kamu tetap bisa menyusun soal di paket soal sesimu sendiri.",
  "staff-only": "Akun ini tidak punya akses ke Sora. Hubungi admin Tera kalau seharusnya punya.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Masuk ke Sora</h1>
        <p className="text-sm text-gray-500">Untuk tutor yang membuat & mengelola paket soal.</p>
      </div>

      {message && <p className="rounded bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          {errorMessage[error] ?? error}
        </p>
      )}

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
        Akun dikelola di Tera — masuk dengan akun admin yang sama. Kalau kamu tutor, penyusunan
        soal memang bukan aksesmu.
      </p>
    </div>
  );
}
