"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  COVERAGE_HINT,
  COVERAGE_LABEL,
  STATE_ORDER,
  type CoverageState,
  type SessionCoverage,
} from "@/lib/coverage";
import { FilterBar, SearchInput, FilterSelect } from "@/lib/SearchFilter";
import { assignExistingToSession, createQuizForSession, unassignSession } from "./actions";

export interface QuizPackage {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  assigned: boolean;
}

const stateColor: Record<CoverageState, string> = {
  belum: "bg-red-50 text-red-700",
  "luar-sora": "bg-amber-50 text-amber-800",
  "belum-siap": "bg-yellow-50 text-yellow-800",
  siap: "bg-green-50 text-green-700",
};

const FILTERS: { key: CoverageState | "perlu" | ""; label: string }[] = [
  { key: "perlu", label: "Perlu soal" },
  { key: "belum", label: COVERAGE_LABEL.belum },
  { key: "luar-sora", label: COVERAGE_LABEL["luar-sora"] },
  { key: "belum-siap", label: COVERAGE_LABEL["belum-siap"] },
  { key: "siap", label: COVERAGE_LABEL.siap },
  { key: "", label: "Semua sesi" },
];

export default function SessionCoverageList({
  sessions,
  packages,
  renderedAt,
  truncated,
  isTutor,
}: {
  sessions: SessionCoverage[];
  packages: QuizPackage[];
  renderedAt: number;
  truncated: boolean;
  isTutor: boolean;
}) {
  // Bawaannya "Perlu soal": halaman ini dibuka untuk menemukan yang bolong,
  // dan sesi yang sudah beres hanya akan mengubur mereka.
  const [filter, setFilter] = useState<CoverageState | "perlu" | "">("perlu");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<CoverageState, number> = { belum: 0, "luar-sora": 0, "belum-siap": 0, siap: 0 };
    for (const s of sessions) c[s.state]++;
    return c;
  }, [sessions]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions
      .filter((s) => {
        if (filter === "perlu" ? s.state === "siap" : filter && s.state !== filter) return false;
        if (!needle) return true;
        return (
          (s.topic ?? "").toLowerCase().includes(needle) ||
          (s.className ?? "").toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          // Dalam satu keadaan, yang paling dekat ke hari ini duluan: sesi minggu
          // depan masih bisa diselamatkan, sesi tahun lalu tinggal utang catatan.
          Math.abs(new Date(a.scheduledAt).getTime() - renderedAt) -
            Math.abs(new Date(b.scheduledAt).getTime() - renderedAt),
      );
  }, [sessions, filter, query, renderedAt]);

  const perlu = counts.belum + counts["luar-sora"] + counts["belum-siap"];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Asesmen</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Asesmen dinilai per sesi kelas, jadi daftarnya adalah daftar sesi: semua sesi Tera sejak
          awal{isTutor ? " yang jadi tanggung jawabmu" : ""}, dengan keadaan soalnya. {perlu} dari{" "}
          {sessions.length} sesi belum punya soal yang bisa dikerjakan murid.
        </p>
      </div>

      {truncated && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Jadwalnya lebih panjang dari yang bisa dimuat sekali jalan; sesi paling tua belum ikut
          terhitung. Yang tampil di sini tetap benar untuk sesi terbaru.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(COVERAGE_LABEL) as CoverageState[]).map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setFilter(filter === state ? "perlu" : state)}
            title={COVERAGE_HINT[state]}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              filter === state ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-2xl font-semibold text-gray-900">{counts[state]}</p>
            <p className="mt-0.5 text-xs text-gray-500">{COVERAGE_LABEL[state]}</p>
          </button>
        ))}
      </div>

      <FilterBar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Cari kelas atau topik…"
          label="Cari sesi"
        />
        <FilterSelect value={filter} onChange={setFilter} label="Saring keadaan">
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          {filter === "perlu" && !query
            ? "Semua sesi sudah punya soal yang bisa dikerjakan."
            : "Tidak ada sesi yang cocok dengan saringan itu."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visible.map((s) => (
            <Row key={s.id} session={s} packages={packages} renderedAt={renderedAt} />
          ))}
        </div>
      )}

    </div>
  );
}

function Row({
  session,
  packages,
  renderedAt,
}: {
  session: SessionCoverage;
  packages: QuizPackage[];
  renderedAt: number;
}) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const when = new Date(session.scheduledAt);
  const lewat = when.getTime() < renderedAt;
  // Paket yang sudah ada tapi belum siap tidak perlu paket kedua — yang
  // dibutuhkan adalah kembali ke editornya.
  const lanjutan = session.assessments.find((a) => a.quizId);

  // Paket yang sudah menempel di sesi ini tidak ditawarkan lagi; sisanya boleh,
  // termasuk yang sudah dipakai sesi lain (satu paket memang boleh dipakai
  // berkali-kali, lihat migrasi 074).
  const sudahDisini = new Set(session.assessments.map((a) => a.quizId));
  const kandidat = packages.filter((p) => !sudahDisini.has(p.id));

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {session.topic || "Tanpa topik"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateColor[session.state]}`}>
              {COVERAGE_LABEL[session.state]}
            </span>
            {session.assessments.some((a) => a.origin === "tera") && (
              <span
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                title="Baris asesmennya diketik di Tera — tidak ada paket soal Sora di baliknya, nilainya diisi manual."
              >
                Bukan dari Sora
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {when.toLocaleString("id-ID", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {session.className ? ` — ${session.className}` : ""}
            {lewat ? " — sudah lewat" : ""}
          </p>
        </div>

        {lanjutan?.quizId ? (
          <Link
            href={`/dashboard/quizzes/${lanjutan.quizId}/edit?dari=asesmen`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50"
          >
            Buka soalnya
          </Link>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => createQuizForSession(session.id))}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Membuat…" : "Buatkan soal"}
          </button>
        )}

        {kandidat.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="text-xs text-gray-500 underline-offset-2 hover:underline"
          >
            {picking ? "Batal" : "Pakai paket yang ada"}
          </button>
        )}
      </div>

      {/* Penugasan yang sudah ada: kodenya di sini karena itulah yang dibagikan
          ke murid, dan menariknya juga di sini — dulu keduanya cuma bisa
          dijangkau lewat editor paketnya. */}
      {session.assessments.some((a) => a.quizId) && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {session.assessments
            .filter((a) => a.quizId)
            .map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-gray-700">{a.title}</span>
                {a.shareCode ? (
                  <Link href={`/q/${a.shareCode}`} target="_blank" className="underline">
                    /q/{a.shareCode} ↗
                  </Link>
                ) : (
                  <span className="text-gray-400">Tanpa kode</span>
                )}
                <form action={unassignSession.bind(null, a.id)} className="shrink-0">
                  <button
                    type="submit"
                    disabled={a.graded}
                    title={
                      a.graded
                        ? "Sudah ada nilai murid di sesi ini — penugasannya tidak bisa ditarik"
                        : undefined
                    }
                    className="text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                  >
                    {a.graded ? "Sudah dinilai" : "Tarik"}
                  </button>
                </form>
              </li>
            ))}
        </ul>
      )}

      {picking && (
        <form
          action={assignExistingToSession.bind(null, session.id)}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {/* Judul paket bisa panjang, dan select melebar mengikuti opsi
              terpanjangnya sampai memaksa halaman menggeser kalau tidak dikunci. */}
          <select
            name="quiz_id"
            required
            defaultValue=""
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:flex-1"
          >
            <option value="" disabled>
              Pilih paket soal…
            </option>
            {kandidat.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || "Tanpa judul"}
                {p.status === "published" ? "" : " (draf)"}
                {p.assigned ? " — dipakai sesi lain" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Tugaskan
          </button>
        </form>
      )}
    </div>
  );
}
