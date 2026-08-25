import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Ke mana pemilik sesi dipulangkan, per role.
 *
 * Halaman ini adalah etalase: ia menjelaskan Sora kepada orang yang belum
 * mengenalnya. Bagi yang sudah masuk — keluarga yang mengetuk kartu SORA di
 * beranda Tera, admin yang mengetik alamatnya — ia cuma satu ketukan tambahan
 * yang menanyakan hal yang jawabannya sudah diketahui.
 *
 * Role yang tidak terdaftar di sini tetap melihat etalasenya, dan itu memang
 * yang benar: `mandiri` berlatih di repo Tera (`/belajar`), bukan di sini, jadi
 * tidak ada halaman Sora yang pantas jadi berandanya.
 */
const BERANDA: Record<string, string> = {
  admin: "/dashboard",
  tutor: "/dashboard",
  parent: "/practice",
  student: "/practice",
};

export default async function Home() {
  const { role } = await getCurrentUser();
  const beranda = role ? BERANDA[role] : undefined;

  if (beranda) {
    redirect(beranda);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold">Sora</h1>
      <p className="max-w-md text-lg text-gray-500">
        Buat paket soal dalam hitungan menit, bagikan lewat link atau kode, dan nilai jawaban murid
        secara otomatis.
      </p>
      <div className="flex gap-4">
        <Link
          href="/practice"
          className="rounded bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          Latihan Mandiri
        </Link>
        <Link
          href="/login"
          className="rounded border border-gray-300 px-5 py-3 text-sm font-medium hover:bg-gray-50"
        >
          Masuk sebagai Admin
        </Link>
      </div>
    </div>
  );
}
