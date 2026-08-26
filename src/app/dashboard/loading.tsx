import { QuizListSkeleton } from "@/lib/skeletons";

/**
 * Berlaku untuk Paket Soal, dan lewat pewarisan segmen untuk halaman dashboard
 * lain yang belum punya `loading` sendiri — semuanya daftar dengan bentuk sama.
 */
export default function DashboardLoading() {
  return <QuizListSkeleton />;
}
