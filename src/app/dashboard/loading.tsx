import { QuizListSkeleton } from "@/lib/skeletons";

/**
 * Berlaku untuk Asesmen dan — lewat pewarisan segmen — Remedial serta Try Out,
 * karena ketiganya memang daftar dengan bentuk yang sama.
 */
export default function DashboardLoading() {
  return <QuizListSkeleton />;
}
