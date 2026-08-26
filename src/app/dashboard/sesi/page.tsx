import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { nowMs } from "@/lib/relative-time";
import {
  buildCoverage,
  type RawAssessment,
  type RawQuiz,
  type RawSession,
  type SessionCoverage,
} from "@/lib/coverage";
import { chunk, fetchAllPages } from "@/lib/paginate";
import SessionCoverageList from "./SessionCoverageList";

/** Paket soal apa adanya; `kind` disebut opsional karena migrasi 079 bisa belum jalan. */
interface RawQuizRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  kind?: string | null;
}

export default async function SessionCoveragePage() {
  const supabase = await createClient();
  const { isTutor } = await getCurrentUser();

  // Sesi batal tidak pernah dikerjakan siapa pun; memasukkannya hanya membuat
  // daftar utang terlihat lebih besar dari yang sebenarnya.
  //
  // Urutan kedua (`id`) ada demi paginasi: dua sesi berjadwal sama persis bisa
  // bertukar tempat antar permintaan, dan satu baris akan terlewat sementara
  // satu lagi terhitung dua kali.
  const { rows: sessionRows, truncated } = await fetchAllPages<RawSession>((from, to) =>
    supabase
      .from("sessions")
      .select("id, scheduled_at, topic, status, classes(name)")
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const { rows: assessmentRows } = await fetchAllPages<RawAssessment>((from, to) =>
    supabase
      .from("assessments")
      .select("id, session_id, quiz_id, title, share_code")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const quizIds = [...new Set(assessmentRows.map((a) => a.quiz_id).filter(Boolean))] as string[];
  const quizRows: RawQuiz[] = (
    await Promise.all(
      chunk(quizIds, 300).map(async (ids) => {
        const { data } = await supabase.from("quizzes").select("id, status").in("id", ids);
        return (data ?? []) as RawQuiz[];
      }),
    )
  ).flat();

  // Jumlah soal hanya dihitung untuk paket yang sudah terbit: paket draf sudah
  // pasti "belum siap" apa pun isinya, dan menanyakan soalnya berarti menyeret
  // ribuan baris `questions` untuk jawaban yang tidak mengubah apa-apa.
  //
  // PostgREST tidak punya group by tanpa view atau RPC, dan menambah keduanya
  // berarti migrasi di repo Tera untuk satu halaman baca — jadi barisnya
  // dihitung di sini.
  const publishedIds = quizRows.filter((q) => q.status === "published").map((q) => q.id);
  const questionRows = (
    await Promise.all(
      chunk(publishedIds, 300).map(async (ids) => {
        const { rows } = await fetchAllPages<{ quiz_id: string }>((from, to) =>
          supabase
            .from("questions")
            .select("quiz_id")
            .in("quiz_id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        );
        return rows;
      }),
    )
  ).flat();

  const questionCounts = new Map<string, number>();
  for (const q of questionRows) {
    questionCounts.set(q.quiz_id, (questionCounts.get(q.quiz_id) ?? 0) + 1);
  }

  // Penugasan yang sudah punya nilai tidak boleh ditarik: `assessment_results`
  // ikut terhapus lewat cascade, dan nilai yang sudah masuk rapor Tera tidak
  // boleh hilang gara-gara satu klik. Ditandai di sini supaya tombolnya mati
  // sejak render, bukan baru menolak setelah diklik.
  const gradedAssessmentIds = new Set(
    (
      await Promise.all(
        chunk(
          assessmentRows.map((a) => a.id),
          300,
        ).map(async (ids) => {
          const { data } = await supabase
            .from("assessment_results")
            .select("assessment_id")
            .in("assessment_id", ids);
          return (data ?? []) as { assessment_id: string }[];
        }),
      )
    )
      .flat()
      .map((r) => r.assessment_id),
  );

  const coverage: SessionCoverage[] = buildCoverage({
    sessions: sessionRows,
    assessments: assessmentRows,
    quizzes: quizRows,
    questionCounts,
    gradedAssessmentIds,
  });

  // Paket asesmen yang tidak menempel ke sesi mana pun. Sejak daftar paket
  // berdiri sendiri dihapus, halaman ini satu-satunya jalan masuknya — tanpa
  // bagian ini draf yang belum ditugaskan hidup di database tapi tidak bisa
  // dibuka dari mana pun.
  //
  // `select("*")` dengan penyaringan di sini, bukan `.eq("kind", ...)`: kolom
  // `kind` baru ada sejak migrasi 079 dan menyebut namanya akan menggagalkan
  // seluruh query kalau migrasinya belum jalan.
  const assignedQuizIds = new Set(assessmentRows.map((a) => a.quiz_id).filter(Boolean));
  const { rows: allQuizRows } = await fetchAllPages<RawQuizRow>((from, to) =>
    supabase
      .from("quizzes")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const packages = (allQuizRows as RawQuizRow[])
    .filter((q) => (q.kind ?? "asesmen") === "asesmen")
    .map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      createdAt: q.created_at,
      // Satu paket boleh dipakai di banyak sesi, jadi ini bukan penyaring —
      // hanya penanda supaya yang belum punya rumah bisa dikumpulkan sendiri.
      assigned: assignedQuizIds.has(q.id),
    }));

  return (
    <SessionCoverageList
      sessions={coverage}
      packages={packages}
      renderedAt={nowMs()}
      truncated={truncated}
      isTutor={isTutor}
    />
  );
}
