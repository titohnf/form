import { redirect } from "next/navigation";

/**
 * Tujuan redirect setelah login, dan dulu daftar paket asesmen.
 *
 * Asesmen sekarang hidup di daftar sesi — sebuah asesmen tanpa sesi tidak
 * punya roster dan nilainya tidak mengalir ke rapor, jadi daftar paket yang
 * berdiri sendiri hanya mengulang halaman itu dari arah yang lebih buta.
 */
export default function DashboardPage() {
  redirect("/dashboard/sesi");
}
