import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Ke mana pemilik sesi dipulangkan, per role.
 *
 * Role yang tidak terdaftar di sini tidak punya halaman di Sora — `mandiri`
 * berlatih di `/belajar` milik repo Tera — jadi ia dipulangkan ke /login dengan
 * kalimat yang menjelaskan itu, bukan dibiarkan menebak.
 */
const BERANDA: Record<string, string> = {
  admin: "/dashboard",
  tutor: "/dashboard",
  parent: "/practice",
  student: "/practice",
};

/**
 * Root Sora tidak punya isi sendiri; ia cuma menunjuk pintu yang benar.
 *
 * Dulu di sini ada etalase — judul, satu paragraf penjelasan, dua tombol. Itu
 * halaman untuk orang yang belum mengenal Sora, dan orang seperti itu tidak
 * pernah datang: yang mengetik alamat ini adalah admin yang mau masuk, dan yang
 * mengetuk kartu SORA di beranda Tera adalah keluarga yang sudah masuk. Bagi
 * keduanya, etalase itu satu ketukan yang menanyakan hal yang jawabannya sudah
 * diketahui.
 *
 * Murid pemegang kode tidak punya sesi dan karenanya ikut mendarat di /login —
 * jalurnya diteruskan oleh satu tautan di sana, sampai `/practice` pensiun dan
 * latihan sepenuhnya pindah ke Tera.
 */
export default async function Home() {
  const { role } = await getCurrentUser();

  if (!role) {
    redirect("/login");
  }

  redirect(BERANDA[role] ?? "/login?error=tanpa-beranda");
}
