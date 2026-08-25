import Link from "next/link";
import SubmitButton from "@/lib/SubmitButton";
import { login } from "./actions";

/**
 * Kode dari proxy (lihat dashboardDenial) dan dari root dijadikan kalimat yang
 * bisa dibaca.
 */
const errorMessage: Record<string, string> = {
  "bank-admin-only":
    "Bank soal hanya bisa diakses admin. Sebagai tutor kamu tetap bisa menyusun soal di paket soal sesimu sendiri.",
  "staff-only": "Akun ini tidak punya akses ke Sora. Hubungi admin Tera kalau seharusnya punya.",
  "tanpa-beranda":
    "Akun ini tidak punya halaman di Sora. Kalau kamu berlangganan, latihan soalnya ada di aplikasi Tera.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Masuk ke Sora</h1>

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
        <SubmitButton
          pendingLabel="Memproses…"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          Masuk
        </SubmitButton>
      </form>

      {/* Murid pemegang kode tidak punya akun, jadi halaman ini adalah jalan buntu
          baginya — padahal ia mendarat di sini setiap kali membuka alamat Sora.
          Satu baris ini yang meneruskannya. Ikut dihapus saat `/practice` pensiun
          dan latihan sepenuhnya pindah ke Tera. */}
      <p className="border-t border-gray-100 pt-6 text-sm text-gray-500">
        Murid dengan kode latihan{" "}
        <Link href="/practice" className="font-medium text-blue-600 hover:underline">
          mulai di sini
        </Link>
        .
      </p>
    </div>
  );
}
